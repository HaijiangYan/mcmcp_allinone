// what kind of stimuli you wish to send to the front-end? 
// If just coordinate, use 'raw'; otherwise, you need to find out yourself.

// keep the original stimuli: use for local test
function raw(array) {
    return array;
}

// turn the stimuli into an image
function to_image(array) {
    return array;
}

module.exports = {raw, to_image};