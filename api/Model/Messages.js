const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    data: {type: String},
    file: {type: String},
    sender: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
    reciever: {type: mongoose.Schema.Types.ObjectId, ref: 'User'}
}, {timestamps:true});

const messageModel = mongoose.model('Messages', MessageSchema);

module.exports = messageModel;