// controllers/dataController.js
let stimuli_processing;

const { pool } = require('../config/database');
const sampling = require('../models/sampling');
const transformer = require('../models/transformer');
const gk = require('../models/gatekeeper');
const group_table_name = process.env.group_table_name;  // only work if experiment mode is MCMCP (not individual)

/////////////////////// stimuli processing before sending to the frontend ///////////////////////
if (process.env.mode==='test') {
  stimuli_processing = transformer.raw;
} else if (process.env.mode==='image') {
  stimuli_processing = transformer.to_image;
}
/////////////////////////////////////////////////////////////////////////////////////////////////////


/////////////////////// proposal function: isotropic Gaussian ///////////////////////
const proposal_cov = Array(Number(process.env.dim)).fill().map((_, i) => 
  Array(Number(process.env.dim)).fill().map((_, j) => i === j ? Number(process.env.proposal_cov) : 0)
);  // align with process.env.dim 
////////////////////////////////////////////////////////////////////////////////////////////


////////////////// gatekeeper define ///////////////////////
let gatekeeper;

if (process.env.gatekeeper==='False') {
  gatekeeper = false;
} else if (process.env.gatekeeper==='Custom') {
  var gatekeepers = []
  const gatekeeper_parameters = {  // align with process.env.dim 
    // n*n covariance matrix to define the gatekeeper
    sigma : [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    // n-dimensional mean vector
    mu : [0, 0, 0]
  }
  // call a gaussian gatekeeper class with customized parameters
  gatekeeper = new gk.Gaussian(gatekeeper_parameters);
  // gatekeepers.push(new gk.Gaussian(gatekeeper_parameters));
} else if (process.env.gatekeeper==='External') {
  gatekeeper = false;
}
/////////////////////////////////////////////////////////////////////


/////////////////////// experiment settings ///////////////////////
const n_chain = Number(process.env.n_chain);
const classes = process.env.classes.split("/");
const class_questions = process.env.class_questions.split("/");
const n_class = classes.length;
const max_trial = Number(process.env.trial_per_participant_per_class);
const max_trial_prior = Number(process.env.trial_per_participant_per_label);
////////////////////////////////////////////////////////////////////////////////////////////



///////////////////////// api functions /////////////////////////
exports.set_table_ind = async (req, res, next) => {
  const name = req.body.names;
  var class_order = sampling.shuffle(Array.from(Array(n_class).keys()));
  // console.log(classes, class_questions);
  var table_name;
  try {
    for (let i=1; i<=n_chain; i++) {
      // console.log(i);
      for (let j=0; j<n_class; j++) {
        table_name = name + '_' + classes[j] + `_no${i}`;
        await pool.query(`CREATE TABLE IF NOT EXISTS ${table_name} (
          id SERIAL PRIMARY KEY,
          trial INTEGER NOT NULL,
          choices JSON NOT NULL,
          picked BOOLEAN, 
          gatekeeper BOOLEAN
          );`);  
      }
    }
    res.status(200).json({
      "class_order": class_order, 
      "classes": classes, 
      "class_questions": class_questions
    });
  } catch (error) {
    next(error);
  }
};

exports.set_table_group = async (req, res, next) => {
  // const { name } = req.body;
  var table_name;
  const class_order = sampling.shuffle(Array.from(Array(n_class).keys()));
  try {
    // console.log(name);
    for (let i=1; i<=n_chain; i++) {
      // console.log(i);
      for (let j=0; j<n_class; j++) {
        table_name = group_table_name + '_' + classes[j] + `_no${i}`;
        await pool.query(`CREATE TABLE IF NOT EXISTS ${table_name} (
          id SERIAL PRIMARY KEY,
          trial INTEGER NOT NULL,
          participant_id TEXT,
          choices JSON NOT NULL,
          picked BOOLEAN, 
          gatekeeper BOOLEAN
          );`);  
      }
    }
    res.status(200).json({
      "class_order": class_order, 
      "classes": classes, 
      "class_questions": class_questions
    });
  } catch (error) {
    next(error);
  }
};

exports.set_table_blockwise = async (req, res, next) => {
  const name = req.body.names;
  var table_name;
  try {
    // console.log(name);
    for (let i=1; i<=n_chain; i++) {
      // console.log(i);
      for (let j=0; j<n_class; j++) {
        table_name = name + '_blockwise_' + classes[j] + `_no${i}`;
        await pool.query(`CREATE TABLE IF NOT EXISTS ${table_name} (
          id SERIAL PRIMARY KEY,
          trial INTEGER NOT NULL,
          participant_id TEXT,
          choices JSON NOT NULL,
          picked BOOLEAN, 
          gatekeeper BOOLEAN
          );`);  
      }

      table_name = name + `_prior_no${i}`;
      await pool.query(`CREATE TABLE IF NOT EXISTS ${table_name} (
        id SERIAL PRIMARY KEY,
        trial INTEGER NOT NULL,
        participant_id TEXT,
        choices TEXT NOT NULL,
        picked BOOLEAN, 
        gatekeeper BOOLEAN
        );`);  
    }
    res.status(200).json({
      "start_classes": classes.sort(() => .5 - Math.random()).slice(0, n_chain),
      "classes": classes, 
      "class_questions": class_questions, 
      "max_turnpoint": process.env.max_turnpoint,
    });
  } catch (error) {
    next(error);
  }
};

///////////////////////////////////////////////////////////
/////////////////////initialize the choices

exports.start_choices_ind = async (req, res, next) => {
  // console.log(req.header);
  const name = req.header('ID');
  const current_class = req.header('current_class');
  var table_name, current_state, proposal;
  // console.log(name);
  try {
    for (let i=1; i<=n_chain; i++) {
      // console.log(i);
      table_name = name + '_' + current_class + `_no${i}`;
      current_state = sampling.uniform_array(Number(process.env.dim));
      proposal = sampling.gaussian_array(current_state, proposal_cov);
      await pool.query(
        `INSERT INTO ${table_name} (trial, choices) 
        VALUES (1, $1), (1, $2)`,
        [JSON.stringify(current_state), JSON.stringify(proposal)]
      );
    }
    if (!gatekeeper) {
      res.status(200).json({
        "current": stimuli_processing(current_state), 
        "proposal": stimuli_processing(proposal), 
        "table_no": n_chain});
    } else {
      proposal = await gatekeeper.processing(current_state, proposal, table_name, proposal_cov);
      res.status(200).json({
        "current": stimuli_processing(current_state), 
        "proposal": stimuli_processing(proposal), 
        "table_no": n_chain});
    }
    
  } catch (error) {
    next(error);
  };
};

exports.start_choices_blockwise = async (req, res, next) => {
  if (req.header('target') === 'likelihood') {
    const name = req.header('ID');
    const current_chain = req.header('current_chain');
    const current_class = req.header('current_class');
  
    var table_name, current_state, proposal;
    try {
      table_name = `${name}_blockwise_${current_class}_no${current_chain}`;
      current_state = sampling.uniform_array(Number(process.env.dim));
      proposal = sampling.gaussian_array(current_state, proposal_cov);
      await pool.query(
        `INSERT INTO ${table_name} (trial, choices) 
        VALUES (1, $1), (1, $2)`,
        [JSON.stringify(current_state), JSON.stringify(proposal)]
      );
  
      if (!gatekeeper) {
        res.status(200).json({
          "current": stimuli_processing(current_state), 
          "proposal": stimuli_processing(proposal)});
      } else {
        proposal = await gatekeeper.processing(current_state, proposal, table_name, proposal_cov);
        res.status(200).json({
          "current": stimuli_processing(current_state), 
          "proposal": stimuli_processing(proposal)});
      }
      
    } catch (error) {
      next(error);
    };
  } else if (req.header('target') === 'prior') {
    const name = req.header('ID');
    const current_chain = req.header('current_chain');
  
    var table_name, current_state, proposal;
    try {
      table_name = `${name}_prior_no${current_chain}`;
      current_state = classes[Math.floor(Math.random() * n_class)]; 
      proposal = classes[Math.floor(Math.random() * n_class)];
      while (proposal === current_state) {
        proposal = classes[Math.floor(Math.random() * n_class)];
      }
      await pool.query(
        `INSERT INTO ${table_name} (trial, choices) 
        VALUES (1, $1), (1, $2)`,
        [current_state, proposal]
      );
  
      if (!gatekeeper) {
        res.status(200).json({
          "current": current_state, 
          "proposal": proposal});
      } else {
        proposal = await gatekeeper.processing(current_state, proposal, table_name, proposal_cov);
        res.status(200).json({
          "current": stimuli_processing(current_state), 
          "proposal": stimuli_processing(proposal)});
      }
      
    } catch (error) {
      next(error);
    };
  }
};

////////////////////////////////////
///////////////////////////////////////////////////////////////


exports.get_choices_ind = async (req, res, next) => {
  // console.log("begin");
  const name = req.header('ID');
  const current_class = req.header('current_class');
  const table_no = Math.floor(Math.random() * n_chain) + 1;
  const table_name = name + '_' + current_class + `_no${table_no}`;
  // const dim = process.env.dim;
  try {
    var current_state, proposal, picked_stimuli;
    
    // console.log(table_name);
    picked_stimuli = await pool.query(`
      SELECT trial, choices FROM (
      SELECT trial, choices, picked FROM ${table_name} ORDER BY id DESC FETCH FIRST 2 ROWS ONLY
      ) AS subquery WHERE picked = true LIMIT 1
      `);

    if (picked_stimuli.rowCount===0) {
      const stimuli_in_new_table = await pool.query(`
        SELECT choices FROM ${table_name} ORDER BY id ASC FETCH FIRST 2 ROWS ONLY
        `);
      current_state = stimuli_in_new_table.rows[0].choices;
      proposal = stimuli_in_new_table.rows[1].choices;
    } else {
      current_state = picked_stimuli.rows[0].choices;
      proposal = sampling.gaussian_array(current_state, proposal_cov);
      // console.log("continue-2");
      await pool.query(
        `INSERT INTO ${table_name} (trial, choices) 
        VALUES (${picked_stimuli.rows[0].trial+1}, $1), (${picked_stimuli.rows[0].trial+1}, $2)`,
        [JSON.stringify(current_state), JSON.stringify(proposal)]
      );
    }

    if (!gatekeeper) {
      res.status(200).json({
        "current": stimuli_processing(current_state), 
        "proposal": stimuli_processing(proposal), 
        "table_no": table_no});
    } else {
      proposal = await gatekeeper.processing(current_state, proposal, table_name, proposal_cov);
      res.status(200).json({
        "current": stimuli_processing(current_state), 
        "proposal": stimuli_processing(proposal), 
        "table_no": table_no});
    }
  } catch (error) {
    next(error);
  }
};

exports.get_choices_group = async (req, res, next) => {
  // console.log("begin");
  const name = req.header('ID');
  const current_class = req.header('current_class');
  const table_no = Math.floor(Math.random() * n_chain) + 1;
  const table_name = group_table_name + '_' + current_class + `_no${table_no}`;
  // const dim = process.env.dim;
  try {
    var current_state, proposal, picked_stimuli;
    
    // console.log(table_name);
    picked_stimuli = await pool.query(`
      SELECT trial, choices FROM (
      SELECT trial, choices, picked FROM ${table_name} ORDER BY id DESC FETCH FIRST 2 ROWS ONLY
      ) AS subquery WHERE picked = true LIMIT 1
      `);

    if (picked_stimuli.rowCount===0) {
      current_state = sampling.uniform_array(Number(process.env.dim));
      proposal = sampling.gaussian_array(current_state, proposal_cov);
      await pool.query(
        `INSERT INTO ${table_name} (trial, participant_id, choices) 
        VALUES (1, $1, $2), (1, $3, $4)`,
        [name, JSON.stringify(current_state), name, JSON.stringify(proposal)]
      );
    } else {
      current_state = picked_stimuli.rows[0].choices;
      proposal = sampling.gaussian_array(current_state, proposal_cov);
      // console.log("continue-2");
      await pool.query(
        `INSERT INTO ${table_name} (trial, participant_id, choices) 
        VALUES (${picked_stimuli.rows[0].trial+1}, $1, $2), (${picked_stimuli.rows[0].trial+1}, $3, $4)`,
        [name, JSON.stringify(current_state), name, JSON.stringify(proposal)]
      );
    }
    // for group-level mcmcp, gatekeeper is not used.
    if (!gatekeeper) {
      res.status(200).json({
        "current": stimuli_processing(current_state), 
        "proposal": stimuli_processing(proposal), 
        "table_no": table_no});
    } else {
      res.status(200).json({
        "current": stimuli_processing(current_state), 
        "proposal": stimuli_processing(proposal), 
        "table_no": table_no});
    }
  } catch (error) {
    next(error);
  }
};


exports.get_choices_blockwise = async (req, res, next) => {
  if (req.header('target')==='likelihood') {
    const name = req.header('ID');
    const current_class = req.header('current_class');
    const current_chain = req.header('current_chain');
    const table_name = `${name}_blockwise_${current_class}_no${current_chain}`;
    // const dim = process.env.dim;
    try {
      var current_state, proposal, picked_stimuli;
      
      // console.log(table_name);
      picked_stimuli = await pool.query(`
        SELECT trial, choices FROM (
        SELECT trial, choices, picked FROM ${table_name} ORDER BY id DESC FETCH FIRST 2 ROWS ONLY
        ) AS subquery WHERE picked = true LIMIT 1
        `);

      if (picked_stimuli.rowCount===0) {
        const stimuli_in_new_table = await pool.query(`
          SELECT choices FROM ${table_name} ORDER BY id ASC FETCH FIRST 2 ROWS ONLY
          `);
        current_state = stimuli_in_new_table.rows[0].choices;
        proposal = stimuli_in_new_table.rows[1].choices;
      } else {
        current_state = picked_stimuli.rows[0].choices;
        proposal = sampling.gaussian_array(current_state, proposal_cov);
        // console.log("continue-2");
        await pool.query(
          `INSERT INTO ${table_name} (trial, choices) 
          VALUES (${picked_stimuli.rows[0].trial+1}, $1), (${picked_stimuli.rows[0].trial+1}, $2)`,
          [JSON.stringify(current_state), JSON.stringify(proposal)]
        );
      }

      if (!gatekeeper) {
        res.status(200).json({
          "current": stimuli_processing(current_state), 
          "proposal": stimuli_processing(proposal)});
      } else {
        proposal = await gatekeeper.processing(current_state, proposal, table_name, proposal_cov);
        res.status(200).json({
          "current": stimuli_processing(current_state), 
          "proposal": stimuli_processing(proposal)});
      }
    } catch (error) {
      next(error);
    }
  } else if (req.header('target')==='prior') {
    const name = req.header('ID');
    const current_chain = req.header('current_chain');
    const table_name = `${name}_prior_no${current_chain}`;
    try {
      var current_state, proposal, picked_stimuli;
      
      // console.log(table_name);
      picked_stimuli = await pool.query(`
        SELECT trial, choices FROM (
        SELECT trial, choices, picked FROM ${table_name} ORDER BY id DESC FETCH FIRST 2 ROWS ONLY
        ) AS subquery WHERE picked = true LIMIT 1
        `);

      if (picked_stimuli.rowCount===0) {
        const stimuli_in_new_table = await pool.query(`
          SELECT choices FROM ${table_name} ORDER BY id ASC FETCH FIRST 2 ROWS ONLY
          `);
        current_state = stimuli_in_new_table.rows[0].choices;
        proposal = stimuli_in_new_table.rows[1].choices;
      } else {
        current_state = picked_stimuli.rows[0].choices;
        proposal = classes[Math.floor(Math.random() * n_class)];
        while (proposal === current_state) {
          proposal = classes[Math.floor(Math.random() * n_class)];
        }
        
        await pool.query(
          `INSERT INTO ${table_name} (trial, choices) 
          VALUES (${picked_stimuli.rows[0].trial+1}, $1), (${picked_stimuli.rows[0].trial+1}, $2)`,
          [current_state, proposal]
        );
      }

      if (!gatekeeper) {
        res.status(200).json({
          "current": current_state, 
          "proposal": proposal});
      } else {
        proposal = await gatekeeper.processing(current_state, proposal, table_name, proposal_cov);
        res.status(200).json({
          "current": stimuli_processing(current_state), 
          "proposal": stimuli_processing(proposal)});
      }
    } catch (error) {
      next(error);
    }
  }
};


////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////


exports.register_choices_ind = async (req, res, next) => {
  const name = req.header('ID');
  const n_trial = req.header('n_trial');
  const selected = req.body.choice;
  // console.log(selected);
  try {
    // console.log(name);
    await pool.query(
      `UPDATE ${name} SET picked = true WHERE id = (
      SELECT id FROM ${name} ORDER BY id DESC OFFSET ${1-selected} LIMIT 1);`,
    );

    if (n_trial < max_trial) {
      res.status(200).json({"finish": 0, "progress": n_trial/max_trial});
    } else {
      res.status(200).json({"finish": 1, "progress": 0});
    }
  } catch (error) {
    next(error);
  }
};

exports.register_choices_group = async (req, res, next) => {
  const table_no = req.header('table');
  const current_class = req.header('current_class');
  const selected = req.body.choice;
  const n_trial = req.header('n_trial');
  const table_name = group_table_name + '_' + current_class + `_no${table_no}`;
  // console.log(selected);
  try {
    // console.log(name);
    await pool.query(
      `UPDATE ${table_name} SET picked = true WHERE id = (
      SELECT id FROM ${table_name} ORDER BY id DESC OFFSET ${1-selected} LIMIT 1);`,
    );

    // console.log(n_trial, max_trial);
    if (n_trial < max_trial) {
      res.status(200).json({"finish": 0, "progress": n_trial/max_trial});
    } else {
      res.status(200).json({"finish": 1, "progress": 0});
    }
  } catch (error) {
    next(error);
  }
};

exports.register_choices_blockwise = async (req, res, next) => {
  const name = req.header('ID');
  const n_trial = req.header('n_trial');
  const selected = req.body.choice;
  if (req.header('target') === 'likelihood') {
    try {
      await pool.query(
        `UPDATE ${name} SET picked = true WHERE id = (
        SELECT id FROM ${name} ORDER BY id DESC OFFSET ${1-selected} LIMIT 1);`,
      );
  
      if (n_trial < max_trial) {
        res.status(200).json({"finish": 0, "progress": n_trial/max_trial});
      } else {
        res.status(200).json({
          "finish": 1, 
          "progress": 0, 
          "proto_sample": stimuli_processing(sampling.uniform_array(Number(process.env.dim))),
        });
      }
    } catch (error) {
      next(error);
    }
  } else if (req.header('target') === 'prior') {
    try {
      // console.log(n_trial);
      await pool.query(
        `UPDATE ${name} SET picked = true WHERE id = (
        SELECT id FROM ${name} ORDER BY id DESC OFFSET ${1-selected} LIMIT 1);`,
      );
  
      if (n_trial < max_trial_prior) {
        res.status(200).json({"finish": 0, "progress": n_trial/max_trial_prior});
      } else {
        res.status(200).json({
          "finish": 1, 
          "progress": 0, 
          "proto_label": classes[Math.floor(Math.random() * n_class)],
        });
      }
    } catch (error) {
      next(error);
    }
  }
  
};