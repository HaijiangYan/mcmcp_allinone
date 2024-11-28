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


/////////////////////// experiment settings ///////////////////////
const n_chain = Number(process.env.n_chain);
const classes = process.env.classes.split("/");
const class_questions = process.env.class_questions.split("/");
const n_class = classes.length;
const max_trial = Number(process.env.trial_per_participant_per_class);
const max_trial_prior = Number(process.env.trial_per_participant_per_label);
const class_orders_consensus = [];
for (let i = 0; i < 100; i++) {
  class_orders_consensus.push(sampling.shuffle(Array.from(Array(n_class).keys())));
}
let consensus_table_participants = {};
let consensus_table_finished = {};
////////////////////////////////////////////////////////////////////////////////////////////


/////////////////////// proposal function: isotropic Gaussian ///////////////////////
const proposal_cov = Array(Number(process.env.dim)).fill().map((_, i) => 
  Array(Number(process.env.dim)).fill().map((_, j) => i === j ? Number(process.env.proposal_cov) : 0)
);  // align with process.env.dim 
////////////////////////////////////////////////////////////////////////////////////////////


////////////////// gatekeeper define ///////////////////////
// console.log(process.env.gatekeeper)
let gatekeeper;

if (process.env.gatekeeper==='False') {
  gatekeeper = false;
} else if (process.env.gatekeeper==='Custom') {
  const gatekeeper_means = JSON.parse(process.env.gatekeeper_means);
  const gatekeeper_covs = JSON.parse(process.env.gatekeeper_covs);
  gatekeeper = {}
  for (cate of classes) {
    var gatekeeper_parameters = {
      // n*n covariance matrix to define the gatekeeper
      sigma : gatekeeper_covs[cate],
      // n-dimensional mean vector
      mu : gatekeeper_means[cate]
    }
    // call a gaussian gatekeeper class with customized parameters
    gatekeeper[cate] = new gk.Gaussian(gatekeeper_parameters);
  }
} else {
  gatekeeper = false;
}
/////////////////////////////////////////////////////////////////////


///////////////////////// api functions /////////////////////////
exports.set_table_consensus = async (req, res, next) => {
  try {
  await pool.query(`CREATE TABLE IF NOT EXISTS participants (
    id SERIAL PRIMARY KEY,
    participant TEXT NOT NULL,
    team INTEGER NOT NULL
    );`); 
    
  const name = req.body.names;
  const n_row_result = await pool.query("SELECT COUNT(*) FROM participants");
  const n_row = parseInt(n_row_result.rows[0].count, 10);
  const team_id = Math.floor(n_row/Number(process.env.consensus_n))+1;

  await pool.query(`
    INSERT INTO participants (participant, team) 
    VALUES ($1, $2)`,
    [name, team_id]
  );
  // console.log(classes, class_questions);
  var table_name;
  var team_order
  if ((n_row+1)%Number(process.env.consensus_n)===0) {
    const teammates = await pool.query(`SELECT participant FROM participants WHERE team = $1`, [team_id]);
    for (let i=1; i<=n_chain; i++) {
      // console.log(i);
      for (let j=0; j<n_class; j++) {
        table_name = `consensus_${team_id}_${classes[j]}_no${i}`;
        // console.log(table_name);
        await pool.query(`CREATE TABLE IF NOT EXISTS ${table_name} (
          id SERIAL PRIMARY KEY,
          trial INTEGER NOT NULL,
          choices JSON NOT NULL,
          picked BOOLEAN
          );`);  
        team_order = sampling.createShiftedArray(Number(process.env.consensus_n), j*n_chain+i-1);
        var tempo_order = [];
        for (t_idx of team_order) {
          // await pool.query(`ALTER TABLE ${table_name} ADD ${teammates.rows[t_idx].participant+'_ready'} BOOLEAN;`); 
          await pool.query(`ALTER TABLE ${table_name} ADD ${teammates.rows[t_idx].participant} BOOLEAN;`); 
          tempo_order.push(teammates.rows[t_idx].participant);
        }
        consensus_table_participants[table_name] = tempo_order;
        consensus_table_finished[table_name] = 0;
      }
    }
  }
  res.status(200).json({
    "class_order": class_orders_consensus[team_id-1], 
    "classes": classes, 
    "class_questions": class_questions, 
    "n_rest": Number(process.env.n_rest), 
    "mode": process.env.mode,
    "team_id": team_id,
    "n_teammates": Number(process.env.consensus_n),
    "n_chain": n_chain,
  });
  } catch (error) {
    next(error);
  }
};

exports.check_waitingroom = async (req, res, next) => {
  const team_id = req.header('team_id');
  try {
    const teammates = await pool.query(`SELECT COUNT(*) FROM participants WHERE team = $1`, [team_id]);
    const numberOfteammates = parseInt(teammates.rows[0].count, 10);
    res.status(200).json({
      "count": numberOfteammates,
    });
  } catch (error) {
    next(error);
  }
}


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
      "class_questions": class_questions, 
      "n_rest": Number(process.env.n_rest), 
      "mode": process.env.mode,
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
      "class_questions": class_questions, 
      "n_rest": Number(process.env.n_rest), 
      "mode": process.env.mode,
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
      "classes": classes, 
      "start_classes": [...classes].sort(() => 0.5 - Math.random()).slice(0, n_chain),
      "class_questions": class_questions, 
      "max_turnpoint": process.env.max_turnpoint, 
      "n_rest": Number(process.env.n_rest), 
      "mode": process.env.mode,
    });
  } catch (error) {
    next(error);
  }
};

///////////////////////////////////////////////////////////
/////////////////////initialize the choices
exports.get_choices_consensus = async (req, res, next) => {
  // console.log(req.header);
  const name = req.header('ID');
  const current_class = req.header('current_class');
  const team_id = req.header('team_id');
  const table_no = req.header('current_chain');
  const table_name = `consensus_${team_id}_${current_class}_no${table_no}`;
  var current_state, proposal, selfReady;
  // console.log(name);
  try {
    // Check if the table is empty
    const table_content = await pool.query(`SELECT COUNT(*) FROM ${table_name}`);
    const isTableEmpty = parseInt(table_content.rows[0].count, 10) === 0;
    // console.log(isTableEmpty);
    if (isTableEmpty) {
      // check the order of the participants
      const firstReady = consensus_table_participants[table_name][0];
      // console.log(c_order, firstReady);

      current_state = sampling.uniform_array(Number(process.env.dim));
      proposal = sampling.gaussian_array(current_state, proposal_cov);
      // console.log(current_state, proposal);

      await pool.query(
        `INSERT INTO ${table_name} (trial, choices, ${firstReady}) 
        VALUES (1, $1, null), (1, $2, $3)`,
        [JSON.stringify(current_state), JSON.stringify(proposal), true]
      );

      res.status(204).send();

    } else {
      if (consensus_table_finished[table_name] === 1) {
        res.status(201).send();
      } else {
        const stimuli_in_new_table = await pool.query(`
          SELECT trial, choices, ${name} FROM ${table_name} ORDER BY id DESC FETCH FIRST 2 ROWS ONLY
          `);
        current_state = stimuli_in_new_table.rows[1].choices;
        proposal = stimuli_in_new_table.rows[0].choices;
        selfReady = stimuli_in_new_table.rows[0][`${name}`];

        if (selfReady) {
          res.status(200).json({
            "progress": stimuli_in_new_table.rows[0].trial/(max_trial/n_chain),  // should be interger multiple of n_chain
            "current": await stimuli_processing(current_state), 
            "proposal": await stimuli_processing(proposal)});
        } else {
          res.status(204).send();
        }
      }
    }

  } catch (error) {
    next(error);
  };
};


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
        "current": await stimuli_processing(current_state), 
        "proposal": await stimuli_processing(proposal), 
        "table_no": n_chain});
    } else {
      proposal = await gatekeeper[current_class].processing(current_state, proposal, table_name, proposal_cov);
      res.status(200).json({
        "current": await stimuli_processing(current_state), 
        "proposal": await stimuli_processing(proposal), 
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
          "current": await stimuli_processing(current_state), 
          "proposal": await stimuli_processing(proposal)});
      } else {
        proposal = await gatekeeper[current_class].processing(current_state, proposal, table_name, proposal_cov);
        res.status(200).json({
          "current": await stimuli_processing(current_state), 
          "proposal": await stimuli_processing(proposal)});
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
  
      // if (!gatekeeper) {
      //   res.status(200).json({
      //     "current": current_state, 
      //     "proposal": proposal});
      // } else {
      //   proposal = await gatekeeper.processing(current_state, proposal, table_name, proposal_cov);
      //   res.status(200).json({
      //     "current": stimuli_processing(current_state), 
      //     "proposal": stimuli_processing(proposal)});
      // }
      res.status(200).json({
        "current": current_state, 
        "proposal": proposal});
      
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
        "current": await stimuli_processing(current_state), 
        "proposal": await stimuli_processing(proposal), 
        "table_no": table_no});
    } else {
      proposal = await gatekeeper[current_class].processing(current_state, proposal, table_name, proposal_cov);
      res.status(200).json({
        "current": await stimuli_processing(current_state), 
        "proposal": await stimuli_processing(proposal), 
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
        "current": await stimuli_processing(current_state), 
        "proposal": await stimuli_processing(proposal), 
        "table_no": table_no});
    } else {
      res.status(200).json({
        "current": await stimuli_processing(current_state), 
        "proposal": await stimuli_processing(proposal), 
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
          "current": await stimuli_processing(current_state), 
          "proposal": await stimuli_processing(proposal)});
      } else {
        proposal = await gatekeeper[current_class].processing(current_state, proposal, table_name, proposal_cov);
        res.status(200).json({
          "current": await stimuli_processing(current_state), 
          "proposal": await stimuli_processing(proposal)});
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

      // if (!gatekeeper) {
      //   res.status(200).json({
      //     "current": current_state, 
      //     "proposal": proposal});
      // } else {
      //   proposal = await gatekeeper.processing(current_state, proposal, table_name, proposal_cov);
      //   res.status(200).json({
      //     "current": stimuli_processing(current_state), 
      //     "proposal": stimuli_processing(proposal)});
      // }
      res.status(200).json({
        "current": current_state, 
        "proposal": proposal});
    } catch (error) {
      next(error);
    }
  }
};


////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////
exports.register_choices_consensus = async (req, res, next) => {
  const name = req.header('ID');
  // const n_trial = req.header('n_trial');
  const table_no = req.header('table');
  const current_class = req.header('current_class');
  const team_id = req.header('team_id');
  const selected = req.body.choice;
  const table_name = `consensus_${team_id}_${current_class}_no${table_no}`;

  // const colnames = await pool.query(`
  //   SELECT column_name
  //   FROM information_schema.columns
  //   WHERE table_name = '${table_name}';
  // `);
  const c_order = consensus_table_participants[table_name];

  try {
    if (selected === 0) {  // select the current state
      // console.log('select 0');
      const selected_row = await pool.query(
        `UPDATE ${table_name} 
        SET picked = true WHERE id = (
        SELECT id FROM ${table_name} ORDER BY id DESC OFFSET 1 LIMIT 1)
        RETURNING trial, choices;`,
      );

      if (selected_row.rows[0].trial < max_trial/n_chain) {

        current_state = selected_row.rows[0].choices;
        proposal = sampling.gaussian_array(current_state, proposal_cov);

        await pool.query(
          `INSERT INTO ${table_name} (trial, choices, ${c_order[0]}) 
          VALUES ($4, $1, null), ($4, $2, $3)`,
          [JSON.stringify(current_state), JSON.stringify(proposal), true, selected_row.rows[0].trial+1]
        );
      } else {
        consensus_table_finished[table_name] = 1;
      }

    } else {  // select the proposal

      if (name===c_order[process.env.consensus_n - 1]) {  // you are the last participant
        // console.log('select 0 and last');
        const selected_row = await pool.query(
          `UPDATE ${table_name} 
          SET picked = true WHERE id = (
          SELECT id FROM ${table_name} ORDER BY id DESC LIMIT 1)
          RETURNING trial, choices;`,
        );

        if (selected_row.rows[0].trial < max_trial/n_chain) {
          current_state = selected_row.rows[0].choices;
          proposal = sampling.gaussian_array(current_state, proposal_cov);

          await pool.query(
            `INSERT INTO ${table_name} (trial, choices, ${c_order[0]}) 
            VALUES ($4, $1, null), ($4, $2, $3)`,
            [JSON.stringify(current_state), JSON.stringify(proposal), true, selected_row.rows[0].trial+1]
          );
        } else {
          consensus_table_finished[table_name] = 1;
        }
      } else {
        // console.log('select 0 and not last');
        // set the next participant ready
        const next_p_ready = c_order[c_order.indexOf(name)+1];
        await pool.query(
          `UPDATE ${table_name} 
          SET ${name} = false, ${next_p_ready} = true WHERE id = (
          SELECT id FROM ${table_name} ORDER BY id DESC LIMIT 1);`,
        );
      }
    }
    // console.log(consensus_table_finished[table_name]);
    res.status(200).send();
  } catch (error) {
    next(error);
  }
};


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
        const block_mean = await pool.query(
          `SELECT choices FROM ${name} 
          WHERE picked = true AND gatekeeper IS NULL
          ORDER BY id DESC 
          LIMIT $1;`, 
          [max_trial]
        );

        // Parse choices and calculate mean
        const choicesArrays = block_mean.rows.map(row => row.choices);
        const meanChoice = sampling.calculateMean(choicesArrays);
        // console.log(meanChoice);

        res.status(200).json({
          "finish": 1, 
          "progress": 0, 
          "proto_sample": await stimuli_processing(meanChoice),
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
        const block_max = await pool.query(
          `SELECT choices FROM ${name} 
          WHERE picked = true AND gatekeeper IS NULL
          ORDER BY id DESC 
          LIMIT $1;`, 
          [max_trial_prior]
        );
        const choicesArrays = block_max.rows.map(row => row.choices);
        const maxChoice = sampling.calculateMode(choicesArrays);
        // console.log(maxChoice);

        res.status(200).json({
          "finish": 1, 
          "progress": 0, 
          "proto_label": maxChoice,
        });
      }
    } catch (error) {
      next(error);
    }
  }
  
};