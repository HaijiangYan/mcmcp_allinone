const MultivariateNormal = require("multivariate-normal").default;

// Function to generate a Gaussian random number
function gaussianRandom(mean=0, stdDev=1) {
    let u = 0, v = 0;
    while (u === 0) u = Math.random(); // Converting [0,1) to (0,1)
    while (v === 0) v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return z * stdDev + mean;
}

function uniform_array(x) {
    return Array(x).fill().map(() => Math.random()); 
}

function gaussian_array(mean, cov) {
    const distribution = MultivariateNormal(mean, cov);
    return distribution.sample();
}

function shuffle(array) {
    let currentIndex = array.length;
  
    // While there remain elements to shuffle...
    while (currentIndex != 0) {
  
      // Pick a remaining element...
      let randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
  
      // And swap it with the current element.
      [array[currentIndex], array[randomIndex]] = [
        array[randomIndex], array[currentIndex]];
    }
    return array;
}

// Function to create array with custom start position
function createShiftedArray(length, start) {
    return Array.from(Array(length).keys()).map(i => (i + start) % length);
}

module.exports = {gaussianRandom, uniform_array, gaussian_array, shuffle, createShiftedArray};