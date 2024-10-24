// const port = '8080';
// const host = "http://127.0.0.1";
// const url = host + ':' + port;
var local_pid;
var current_on_left;

var start_classes;
var classes;
var class_questions;
var max_turnpoint;

var current_chain;
var current_class;
var n_trial = 1;
var n_turnpoint = 0;


function consent() {
    window.location.href = `consent`;
}

function submit_id(id) {
    Cookies.set('pid', id);
    axios.post('api/set_table', {
        names: id,
    }, {headers: {
            'Content-Type': 'application/json',
        },
    })
    .then(response => {
        start_classes = JSON.stringify(response.data.start_classes);
        classes = JSON.stringify(response.data.classes);
        class_questions = JSON.stringify(response.data.class_questions);

        Cookies.set('start_classes', start_classes);
        Cookies.set('classes', classes);
        Cookies.set('class_questions', class_questions);
        Cookies.set('max_turnpoint', response.data.max_turnpoint);
    })
    .then(() => {window.location.href = `instruction`;})
    .catch((error) => {
        console.error('Error:', error);
        alert(`Error in setting tables`);
    });
}

function beginExperiment() {
    window.location.href = `experiment`;
}


function load_parameters() {
    local_pid = Cookies.get('pid');

    start_classes = Cookies.get('start_classes');
    start_classes = JSON.parse(start_classes);

    classes = Cookies.get('classes');
    classes = JSON.parse(classes);

    class_questions = Cookies.get('class_questions');
    class_questions = JSON.parse(class_questions);

    max_turnpoint = Number(Cookies.get('max_turnpoint'));
}


function startChoice(the_chain=1, the_class=start_classes[0]) {
    current_chain = the_chain;
    current_class = the_class;
    // console.log(current_chain, current_class);
    axios.get(`api/start_choices`, {
        headers: {
            'ID': local_pid,
            'current_chain': current_chain,
            'current_class': current_class,
            'target': 'likelihood',
        },
    })
    .then(response => {
        $(".question").html(class_questions[classes.indexOf(current_class)]);  //class_questions[classes.findIndex(current_class)]
        current_on_left = 0.5 <= Math.random();
        if (current_on_left) {
            $("#choice_left > h2").html(response.data.current);
            $("#choice_right > h2").html(response.data.proposal);
        } else {
            $("#choice_right > h2").html(response.data.current);
            $("#choice_left > h2").html(response.data.proposal);
        }
        
        fadein_option();
        return response.data;
    })
    .catch((error) => {
        console.error('Error:', error);
        alert(`Error sending list ${local_pid}`);
        endExperiment();
    });
}


function startChoice_prior(stimuli) {

    axios.get(`api/start_choices`, {
        headers: {
            'ID': local_pid,
            'current_chain': current_chain,
            'target': 'prior',
        },
    })
    .then(response => {
        $(".question").html(`Which can best describe the face:${stimuli}`);
        current_on_left = 0.5 <= Math.random();
        if (current_on_left) {
            $("#choice_left > h2").html(response.data.current);
            $("#choice_right > h2").html(response.data.proposal);
        } else {
            $("#choice_right > h2").html(response.data.current);
            $("#choice_left > h2").html(response.data.proposal);
        }
        
        fadein_option();
        return response.data;
    })
    .catch((error) => {
        console.error('Error:', error);
        alert(`Error sending list ${local_pid}`);
        endExperiment();
    });
}


function getChoice(target) {
    // target should be 'likelihood' or 'prior'
    axios.get(`api/get_choices`, {
        headers: {
            'ID': local_pid,
            'current_chain': current_chain,
            'current_class': current_class,
            'target': target,
        },
    })
    .then(response => {
        // console.log(response.data.proposal);
        current_on_left = 0.5 <= Math.random();
        if (current_on_left) {
            $("#choice_left > h2").html(response.data.current);
            $("#choice_right > h2").html(response.data.proposal);
        } else {
            $("#choice_right > h2").html(response.data.current);
            $("#choice_left > h2").html(response.data.proposal);
        }

        fadein_option();
        return response.data;
    })
    .catch((error) => {
        console.error('Error:', error);
        // alert(`Error sending list ${local_pid}`);
        endExperiment();
    });
}


function sendChoice(selected) {
    if (current_on_left) {
        decision = selected;
    } else {
        decision = 1-selected;
    }
    axios.post(`api/register_choices`, {
        choice: decision,
    }, 
        {headers: {
            'Content-Type': 'application/json',
            'ID': `${local_pid}_blockwise_${current_class}_no${current_chain}`,
            'n_trial': n_trial, 
            'target': 'likelihood',
        },
    })
    .then(response => {
        n_trial ++;
        if (!response.data.finish) {
            fadeaway_option(response.data.progress);

            setTimeout(() => {
                getChoice('likelihood');
            }, 500)

        } else {
            // n_turnpoint ++;
            fadeaway_option(response.data.progress);
            n_trial = 1;
            
            $('#button_left, #button_right').off('click');
            // Assign the new function with send_ok(0)
            $('#button_left').on('click', function() {
                sendChoice_prior(0);
            });
            $('#button_right').on('click', function() {
                sendChoice_prior(1);
            });

            setTimeout(() => {
                startChoice_prior(response.data.proto_sample);  
            }, 500)
        }
    })
    .catch((error) => {
        console.error('Error:', error);
        // alert(`Error sending list ${local_pid}`);
        endExperiment();
    });
}

function sendChoice_prior(selected) {
    if (current_on_left) {
        decision = selected;
    } else {
        decision = 1-selected;
    }
    axios.post(`api/register_choices`, {
        choice: decision,
    }, 
        {headers: {
            'Content-Type': 'application/json',
            'ID': `${local_pid}_prior_no${current_chain}`,
            'n_trial': n_trial, 
            'target': 'prior',
        },
    })
    .then(response => {
        n_trial ++;
        if (!response.data.finish) {
            fadeaway_option(response.data.progress);
            setTimeout(() => {
                getChoice('prior');
            }, 500)

        } else {
            n_turnpoint ++;
            if (n_turnpoint < max_turnpoint) {
                fadeaway_option(response.data.progress);
                n_trial = 1;
                
                $('#button_left, #button_right').off('click');
                // Assign the new function with send_ok(0)
                $('#button_left').on('click', function() {
                    sendChoice(0);
                });
                $('#button_right').on('click', function() {
                    sendChoice(1);
                });

                setTimeout(() => {
                    startChoice(current_chain, response.data.proto_label);  
                }, 500) 
            } else {
                if (current_chain<start_classes.length) {
                    n_turnpoint = 0;
                    n_trial = 1;
                    fadeaway_option(response.data.progress);
                    
                    $('#button_left, #button_right').off('click');
                    // Assign the new function with send_ok(0)
                    $('#button_left').on('click', function() {
                        sendChoice(0);
                    });
                    $('#button_right').on('click', function() {
                        sendChoice(1);
                    });
                    setTimeout(() => {
                        startChoice(current_chain+1, start_classes[current_chain]);
                    }, 500) 
                } else {
                    endExperiment();
                }
            }
        }
    })
    .catch((error) => {
        console.error('Error:', error);
        // alert(`Error sending list ${local_pid}`);
        endExperiment();
    });
}

function endExperiment() {
    window.location.href = `thanks`;
}



// UI animation
function fadeaway_option(progress) {
    $('#choice_left').removeClass('fade-in').addClass('fade-out');
    $('#choice_right').removeClass('fade-in').addClass('fade-out');
    setTimeout(() => {
        updateProgress(progress);
    }, 100);
}

function fadein_option() {
    $('#choice_left').removeClass('fade-out').addClass('fade-in');
    $('#choice_right').removeClass('fade-out').addClass('fade-in');
    // setTimeout(() => {
    //     $('#choice_left').removeClass('fade-out').addClass('fade-in');
    //     $('#choice_right').removeClass('fade-out').addClass('fade-in');
    // }, 500);
}

function updateProgress(progress) {
    const progressBar = document.getElementById('progressBar');
    progressBar.style.width = `${progress*100}%`;
}
