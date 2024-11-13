// routes/api.js
const express = require('express');
const router = express.Router();
const dataController = require('../controllers/dataController');

if (process.env.experiment === "MCMCP") {
    router.post("/set_table", dataController.set_table_group);
    router.get('/start_choices', dataController.get_choices_group);
    router.get('/get_choices', dataController.get_choices_group);
    router.post('/register_choices', dataController.register_choices_group);
} else if (process.env.experiment === "individual-MCMCP") {
    router.post("/set_table", dataController.set_table_ind);
    router.get('/start_choices', dataController.start_choices_ind);
    router.get('/get_choices', dataController.get_choices_ind);
    router.post('/register_choices', dataController.register_choices_ind);
} else if (process.env.experiment === "blockwise-MCMCP") {
    router.post("/set_table", dataController.set_table_blockwise);
    router.get('/start_choices', dataController.start_choices_blockwise);
    router.get('/get_choices', dataController.get_choices_blockwise);
    router.post('/register_choices', dataController.register_choices_blockwise);
} else if (process.env.experiment === "consensus-MCMCP") {
    router.post("/set_table", dataController.set_table_consensus);
    router.get('/start_choices', dataController.start_choices_consensus);
    router.get('/get_choices', dataController.get_choices_consensus);
    router.post('/register_choices', dataController.register_choices_consensus);
}


module.exports = router;