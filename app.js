// app.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Serve static files from the 'public' directory
app.use(express.static('public'));

// Home page route.
app.get("/", (req, res) => {
    // res.send("./public/index.html");
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// consent page route.
app.get("/consent", (req, res) => {
    if (process.env.experiment!='blockwise-MCMCP') {
        res.sendFile(path.join(__dirname, 'public', 'consent.html'));
    } else {
        res.sendFile(path.join(__dirname, 'public', 'consent-blockwise.html'));
    }
    
});
// consent page route.
app.get("/instruction", (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'instruction.html'));
});
// end experiment
app.get("/thanks", (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'thanks.html'));
});
// exp page route.
app.get("/experiment", (req, res) => {
    if (process.env.experiment!='blockwise-MCMCP') {
        res.sendFile(path.join(__dirname, 'public', 'experiment-test.html'));
    } else {
        res.sendFile(path.join(__dirname, 'public', 'experiment-blockwise.html'));
    }
});

app.use('/api', apiRoutes);

app.use(errorHandler);

module.exports = app;