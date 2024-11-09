// what kind of stimuli you wish to send to the front-end? 
// If just coordinate, use 'raw'; otherwise, you need to find out yourself.

// keep the original stimuli: use for local test
const axios = require('axios');

async function raw(array) {
    return array;
}

// turn the stimuli into an image
function to_image(array) {
    const url = process.env.imageurl;
    return axios.post(url, {
        data: array,
    }, {headers: {
        'accept': 'application/json', 
        'Content-Type': 'application/json',
    },
    })
    .then(response => {
        // console.log(response.data);
        return response.data;
    })
    .catch((error) => {
        console.error('Error:', error);
    });
}

module.exports = {raw, to_image};