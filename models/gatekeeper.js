// different kinds of gatekeepers here
const sampling = require('../models/sampling');
const { pool } = require('../config/database');
var n = require("numeric");
var sqrt2PI = Math.sqrt(Math.PI * 2);
/**
 * Represents a multivariate gaussian
* @param {{sigma: Array<Array<number>>, mu: Array<number>}} gatekeeper_parameters
**/
function Gaussian(parameters) {
    this.sigma = parameters.sigma;
    this.mu = parameters.mu;
    this.k = this.mu.length; // dimension
    try {
        var det = n.det(this.sigma);
        this._sinv = n.inv(this.sigma); // π ^ (-1)
        this._coeff = 1 / (Math.pow(sqrt2PI, this.k) * Math.sqrt(det));
        if ( !(isFinite(det) && det > 0 && isFinite(this._sinv[0][0]))) {
            throw new Error("Invalid matrix");
        }
    } catch(e) {
        this._sinv = n.rep([this.k, this.k], 0);
        this._coeff = 0;
    }
}

/**
 * Evaluates the density function of the gaussian at the given point
 */
Gaussian.prototype.density = function(x) {
    var delta = n.sub(x, this.mu); // 𝛿 = x - mu
    // Compute  Π = 𝛿T . Σ^(-1) . 𝛿
    var P = 0;
    for(var i=0; i<this.k; i++) {
        var sinv_line = this._sinv[i];
        var sum = 0;
        for(var j=0; j<this.k; j++) {
            sum += sinv_line[j] * delta[j];
        }
        P += delta[i] * sum
    }
    // Return: e^(-Π/2) / √|2.π.Σ|
    return this._coeff * Math.exp(P / -2);
};

// the basic customized gatekeepers
Gaussian.prototype.acceptance = function(current, proposal) {

    const density_current = this.density(current);
    const density_proposal = this.density(proposal);
    // barker acceptance function
    return density_proposal / (density_current + density_proposal);
}
Gaussian.prototype.processing = async function(current_state, proposal, table_name, proposal_cov) {
    var trial_number;
    var proposal = proposal;
    var acceptance_rate = this.acceptance(current_state, proposal);
    while (Math.random() > acceptance_rate) {
        trial_number = await pool.query(
            `UPDATE ${table_name} SET picked = true, gatekeeper = true WHERE id = (
            SELECT id FROM ${table_name} ORDER BY id DESC OFFSET 1 LIMIT 1) 
            RETURNING trial;`,
        );
        // console.log(trial_number.rows[0].trial);
        proposal = sampling.gaussian_array(current_state, proposal_cov);
        acceptance_rate = this.acceptance(current_state, proposal);
        await pool.query(
            `INSERT INTO ${table_name} (trial, choices) 
            VALUES ($1, $2), ($3, $4)`,
            [trial_number.rows[0].trial+1, JSON.stringify(current_state), trial_number.rows[0].trial+1, JSON.stringify(proposal)]
        );
    }
    // console.log(proposal);
    return proposal;
}



module.exports = {Gaussian};