const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bcryptjs = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('./Model/User');
const Messages = require('./Model/Messages');
const jwt = require('jsonwebtoken');
const cookies = require("cookie-parser");
const ws = require('ws');
dotenv.config();
const key = process.env.JWT_SECRET;

const app = express();


app.use(cookies());
mongoose.connect(process.env.MONGOOSE_URL).then(() => {
    console.log('connected to the database!');
})

const bcryptSalt = bcryptjs.genSaltSync(10);

app.use(cors({
    credentials: true,
    origin: process.env.CLIENT_URL,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

async function getUserDataFromRequest(req){
    return new Promise((resolve, reject)=>{
        const token = req.cookies?.token;
        if(token){
            jwt.verify(token, key, {}, (err, userData)=>{
                if(err) throw err;
                resolve(userData);
            });
        }else{
            reject('No token');
        }
    })
}
app.get('/test', (req, res) => {
    res.json("Test Ok");
})

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username: username });
        if (user) {
            const valid = bcryptjs.compareSync(password, user.password);
            if (valid) {
                jwt.sign({ userId: user._id, username }, key, {}, (err, token) => {
                    if (err) throw err;
                    res.cookie('token', token, { sameSite: 'none', secure: true }).status(201).json({
                        id: user._id,
                    });
                });
            } else {
                res.json('invalid');
            }
        }
        else {
            res.json('invalid');
        }
    }
    catch (err) {
        console.log('Error: ', err);
    }
})
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const hashedPassword = bcryptjs.hashSync(password, bcryptSalt);
        const userPresent = await User.findOne({ username: username });
        if (userPresent) {
            res.json('taken');
        }
        else {
            const user = new User({
                username: username,
                password: hashedPassword,
            })
            user.save();
            jwt.sign({ userId: user._id, username }, key, {}, (err, token) => {
                if (err) throw err;
                res.cookie('token', token, { sameSite: 'none', secure: true }).status(201).json({
                    id: user._id,
                });
            });
        }
    }
    catch (err) {
        console.log('Error: ', err);
        res.status(500).json('error');
    }
})

app.get('/messages/:selectedUser', async (req, res)=>{
    try {
    const {selectedUser} = req.params;
    const userData = await getUserDataFromRequest(req);
    const userId = userData.userId;
    const messages = await Messages.find({
        sender: {$in: [selectedUser, userId]},
        reciever: {$in: [selectedUser, userId]}
    })
    res.json(messages);
    }catch(err){
        console.log('Error: ', err);
    }
})

app.get('/profile', (req, res) => {
    try {
        const token = req.cookies?.token;
        if (token) {
            jwt.verify(token, key, {}, (err, userData) => {
                if (err) throw err;
                res.json(userData);
            })
        }
    }
    catch (err) {
        console.log('Error: ', err);
    }
})
app.post('/logout', (req, res)=>{
    try{
        res.cookie('token', '', { sameSite: 'none', secure: true }).status(201).json('loggedOut');
    }
    catch(err){
        console.log('Error: ', err);
    }
})

const server = app.listen(4000, () => {
    console.log('On fire baby!');
})

const wss = new ws.WebSocketServer({ server });

wss.on('connection', (connection, req) => {

    connection.isAlive = true;
    function sendPeopleOnlineOnServer() {
        [...wss.clients].forEach(client => {
            client.send(JSON.stringify({
                connected: [...wss.clients].map(c => ({
                    userId: c.userId,
                    username: c.username
                }))
            }))
        });
    }


    connection.on('message', async (message) => {
        try{
        const messageData = JSON.parse(message.toString());
        const { data, file, sender, recipient } = messageData;
        const newMessage = new Messages({
            data: data,
            file: file,
            sender: sender,
            reciever: recipient
        })
        newMessage.save();
        [...wss.clients].forEach(client => {
            if (client.userId === recipient) {
                {
                    client.send(JSON.stringify({
                        message: {
                            data: data,
                            file: file,
                            sender: sender,
                            reciever: recipient
                        }
                    }))
                }
            }
        })
        }catch(err){
            console.log('Error: ', err);
        }
    })

    const cookie = req.headers.cookie;
    if (cookie) {
        const token = cookie.split('=')[1];
        jwt.verify(token, key, {}, (err, userData) => {
            const { username, userId } = userData;
            connection.username = username;
            connection.userId = userId;
        });
    }

    connection.on('close', () => {
        sendPeopleOnlineOnServer();
    })

    sendPeopleOnlineOnServer();
})
