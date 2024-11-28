// const port = '8080';
// const host = "http://127.0.0.1";
// const url = host + ':' + port;
var local_pid;
var local_chain;
var local_nameIndex;
var current_on_left;
var class_order;
var classes;
var class_questions;
var n_rest;
var mode;
var stimuli_attr;
var stimuli_prefix;
var current_n_class = 0; // which class we're in by order;
var n_trial = 1;
var team_id;
var n_chain;


function consent() {
    window.location.href = `consent`;
}

function submit_id(id) {
    Cookies.set('pid', id);
    axios.post(`api/set_table`, {
        names: id,
    }, {headers: {
            'Content-Type': 'application/json',
        },
    })
    .then(response => {
        Cookies.remove('team_id');
        class_order = JSON.stringify(response.data.class_order);
        classes = JSON.stringify(response.data.classes);
        class_questions = JSON.stringify(response.data.class_questions);
        Cookies.set('class_order', class_order);
        Cookies.set('classes', classes);
        Cookies.set('class_questions', class_questions);
        Cookies.set('n_rest', response.data.n_rest);
        Cookies.set('mode', response.data.mode);
        Cookies.set('team_id', response.data.team_id);
        Cookies.set('n_teammates', response.data.n_teammates);
        Cookies.set('n_chain', response.data.n_chain);
    })
    .then(() => {window.location.href = `instruction`;})
    .catch((error) => {
        console.error('Error:', error);
        alert(`Error in setting tables`);
    });
}

function load_parameters() {
    local_pid = Cookies.get('pid');
    class_order = Cookies.get('class_order');
    class_order = JSON.parse(class_order);
    classes = Cookies.get('classes');
    classes = JSON.parse(classes);
    class_questions = Cookies.get('class_questions');
    class_questions = JSON.parse(class_questions);
    n_rest = Number(Cookies.get('n_rest'));
    mode = Cookies.get('mode');
    team_id = Number(Cookies.get('team_id'));
    n_teammates = Number(Cookies.get('n_teammates'));
    n_chain = Number(Cookies.get('n_chain'));

    local_chain = 1;

    if (mode === 'test') {
        stimuli_attr = 'alt';
        stimuli_prefix = '';
    } else if (mode === 'image') {
        stimuli_attr = 'src';
        stimuli_prefix = 'data:image/png;base64, ';
    }
}

// async function startChoice() {
//     let response;
//     while (true) {
//         try {
//             response = await axios.get(`api/start_choices`, {
//                 headers: {
//                     'ID': local_pid,
//                     'team_id': team_id,
//                     'current_class': classes[class_order[current_n_class]],
//                     'current_chain': local_chain,
//                 },
//             });

//             // Check if the response is the desired one
//             if (response.status === 200) {
//                 $("#wait").css("display", "none");
//                 break; // Exit the loop if the response is valid
//             } else if (response.status === 204) {
//                 $('#waitContent p').html('Please wait your teammates to finish their choices!');
//                 $("#wait").css("display", "flex");
//             }
//         } catch (error) {
//             console.error('Error:', error);
//             alert(`Error sending list ${local_pid}`);
//             endExperiment();
//             return;
//         }
//         // Wait for a specific time before retrying
//         await delay(2000); // 2 seconds delay
//     }

//     // Handle the valid response
//     $(".question").html(class_questions[class_order[current_n_class]]);
//     current_on_left = 0.5 <= Math.random();
//     if (current_on_left) {
//         $("#choice_left > .stimuli").attr(stimuli_attr, stimuli_prefix + response.data.current);
//         $("#choice_right > .stimuli").attr(stimuli_attr, stimuli_prefix + response.data.proposal);
//     } else {
//         $("#choice_right > .stimuli").attr(stimuli_attr, stimuli_prefix + response.data.current);
//         $("#choice_left > .stimuli").attr(stimuli_attr, stimuli_prefix + response.data.proposal);
//     }

//     fadein_option();
// }

async function getChoice() {
    let response;
    while (true) {
        try {
            response = await axios.get(`api/get_choices`, {
                headers: {
                    'ID': local_pid,
                    'team_id': team_id,
                    'current_class': classes[class_order[current_n_class]],
                    'current_chain': local_chain,
                },
            });

            // Check if the response is the desired one
            if (response.status === 200) {  // ready
                updateProgress(response.data.progress);
                $("#wait").css("display", "none");
                break; // Exit the loop if the response is valid
            } else if (response.status === 204) {  //not ready
                $('#waitContent p').html('Please wait your teammates to finish their choices!');
                $("#wait").css("display", "flex");
            } else if (response.status === 201) {
                // the current chain is finished
                updateProgress(0);

                if (local_chain < n_chain) {
                    local_chain ++;
                    n_trial = 1;
                } else {
                    if (current_n_class < classes.length-1) {
                        current_n_class ++;
                        local_chain = 1;
                        n_trial = 1;
                    } else {
                        endExperiment(); 
                        break;
                    }
                }
            }
        } catch (error) {
            console.error('Error:', error);
            alert(`Error sending list ${local_pid}`);
            endExperiment();
            return;
        }
        // Wait for a specific time before retrying
        await delay(2000); // 2 seconds delay
    }

    // Handle the valid response
    $(".question").html(class_questions[class_order[current_n_class]]);
    current_on_left = 0.5 <= Math.random();
    if (current_on_left) {
        $("#choice_left > .stimuli").attr(stimuli_attr, stimuli_prefix + response.data.current);
        $("#choice_right > .stimuli").attr(stimuli_attr, stimuli_prefix + response.data.proposal);
    } else {
        $("#choice_right > .stimuli").attr(stimuli_attr, stimuli_prefix + response.data.current);
        $("#choice_left > .stimuli").attr(stimuli_attr, stimuli_prefix + response.data.proposal);
    }

    fadein_option();
}


function sendChoice(selected) {
    if (current_on_left) {
        decision = selected;
    } else {
        decision = 1-selected;
    }
    // console.log(local_chain);
    axios.post(`api/register_choices`, {
        choice: decision,
    }, 
        {headers: {
            'Content-Type': 'application/json',
            'ID': local_pid,
            'team_id': team_id,
            'table': local_chain, 
            'current_class': classes[class_order[current_n_class]],
            // 'n_trial': n_trial, 
        },
    })
    .then(response => {
        n_trial ++;
        // console.log('get response from the reigister_choices');
        // if (!response.data.finish) {
        if ((n_trial-1)%n_rest===0 && n_trial != 2) {
            time_to_rest().then(() => {
                // Code here will run after the user clicks "Continue"
                fadeaway_option();
                setTimeout(() => {
                    getChoice();
                }, 500)
            });
        } else {
            fadeaway_option();
            setTimeout(() => {
                getChoice();
            }, 500)
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
function fadeaway_option() {
    $('#choice_left').removeClass('fade-in').addClass('fade-out');
    $('#choice_right').removeClass('fade-in').addClass('fade-out');
    // setTimeout(() => {
    //     updateProgress(progress);
    // }, 100);
}

function fadein_option() {
    $('#choice_left').removeClass('fade-out').addClass('fade-in');
    $('#choice_right').removeClass('fade-out').addClass('fade-in');
}

function updateProgress(progress) {
    const progressBar = document.getElementById('progressBar');
    progressBar.style.width = `${progress*100}%`;
}

function time_to_rest() {
    return $.Deferred(function(deferred) {
        // Display the modal
        $('#restContent p').html("You can have a short break now, but please stay with your team and don't let them wait so long!");
        $("#rest").css("display", "flex");

        // Wait for the user to click "Continue"
        $("#continueButton").on("click", function() {
            $("#rest").css("display", "none"); // Hide the modal
            deferred.resolve();    // Continue the script
        });
    }).promise();
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


/////////////////////////////////////////////&&&/////////////////////////////////////////////
// Draw something as the stimuli
//
// function startDrawing() {
//     local_pid = localStorage.getItem('pid');
//     axios.get(`${url}/api/start_choices`, {
//         headers: {
//             'ID': local_pid,
//         },
//     })
//     .then(response => {
//         current_on_left = 0.5 <= Math.random();
//         if (current_on_left) {
//             drawLines(response.data.current, paper_left);
//             drawLines(response.data.proposal, paper_right);
//         } else {
//             drawLines(response.data.current, paper_right);
//             drawLines(response.data.proposal, paper_left);
//         }

//         local_chain = response.data.table_no;
//         return response.data;
//     })
//     .catch((error) => {
//         console.error('Error:', error);
//         // alert(`Error sending list ${local_pid}`);
//         endExperiment();
//     });
// }

// function getDrawing() {
//     axios.get(`${url}/api/get_choices`, {
//         headers: {
//             'ID': local_pid,
//         },
//     })
//     .then(response => {
//         current_on_left = 0.5 <= Math.random();
//         if (current_on_left) {
//             drawLines(response.data.current, paper_left);
//             drawLines(response.data.proposal, paper_right);
//         } else {
//             drawLines(response.data.current, paper_right);
//             drawLines(response.data.proposal, paper_left);
//         }

//         local_chain = response.data.table_no;
//         fadein_option();
//         return response.data;
//     })
//     .catch((error) => {
//         console.error('Error:', error);
//         // alert(`Error sending list ${local_pid}`);
//         endExperiment();
//     });
// }


// function sendDrawing(selected) {
//     if (current_on_left) {
//         decision = selected;
//     } else {
//         decision = 1-selected;
//     }
//     // console.log("result");
//     axios.post(`${url}/api/register_choices`, {
//         choice: decision,
//     }, 
//         {headers: {
//             'Content-Type': 'application/json',
//             'ID': local_pid + `_no${local_chain}`,
//             'table': local_chain, 
//             'n_trial': n_trial, 
//         },
//     })
//     .then(response => {
//         n_trial ++;
//         if (!response.data.finish) {
//             fadeaway_option(response.data.progress);

//             setTimeout(() => {
//                 paper_left.clear();
//                 paper_right.clear();
//                 getDrawing();
//             }, 500)
//         } else {
//             endExperiment();
//         }
//         // setTimeout(() => getChoice(), 500)
//         // startChoice()
//     })
//     .catch((error) => {
//         console.error('Error:', error);
//         // alert(`Error sending list ${local_pid}`);
//         endExperiment();
//     });
// }

// // drawing an object
// drawLines = function (lines, obj) {
//     PPU = 20;
//     const paper = obj;

//     // Display parameters.
//     shoulderJointX = 25;
//     shoulderJointY = 25;
//     bodyLength = 1;
  
//     // Stimulus parameters, convert to pixels and radians.
//     bodyHeightPx = lines[0] * PPU;
//     footSpreadPx = lines[1] * PPU;
//     neckAngleRad = (lines[2] + 90) * (Math.PI / 180);
//     neckLengthPx = lines[3] * PPU;
//     headAngleRad = lines[4] * -1 * (Math.PI / 180) + neckAngleRad;
//     headLengthPx = lines[5] * PPU;
//     bodyTiltRad = lines[6] * (Math.PI / 180);
//     bodyLengthPx = bodyLength * PPU;
//     tailAngleRad = (lines[7] - 90) * (Math.PI / 180);
//     tailLengthPx = lines[8] * PPU;
  
//     // Draw the first front leg, which points forward.
//     frontLeg1 = paper.path("M" + shoulderJointX + "," + shoulderJointY + "L" + (shoulderJointX - footSpreadPx/2) + "," + (shoulderJointY + bodyHeightPx));
//     frontLeg1.attr("stroke-width", "2");
  
//     // Draw the second front leg, which points backward.
//     frontLeg2 = paper.path("M" + shoulderJointX + "," + shoulderJointY + "L" + (shoulderJointX + footSpreadPx/2) + "," + (shoulderJointY + bodyHeightPx));
//     frontLeg2.attr("stroke-width", "2");
  
//     // Draw the neck.
//     neckX = Math.cos(neckAngleRad) * neckLengthPx;
//     neckY = Math.sin(neckAngleRad) * neckLengthPx;
//     neck = paper.path("M" + shoulderJointX + "," + shoulderJointY + "l" + neckX + "," + neckY);
//     neck.attr("stroke-width", "2");
  
//     // Draw the head.
//     headX = Math.cos(headAngleRad) * headLengthPx;
//     headY = Math.sin(headAngleRad) * headLengthPx;
//     head = paper.path("M" + (shoulderJointX + neckX) + "," + (shoulderJointY + neckY) + "l" + headX + "," + headY);
//     head.attr("stroke-width", "2");
  
//     // Draw the body.
//     bodyX = Math.cos(bodyTiltRad) * bodyLengthPx;
//     bodyY = Math.sin(bodyTiltRad) * bodyLengthPx;
//     body = paper.path("M" + shoulderJointX + "," + shoulderJointY + "l" + bodyX + "," + bodyY);
//     body.attr("stroke-width", "2");
  
//     // Draw the first back leg, which points forward.
//     backLeg1 = paper.path("M" + (shoulderJointX + bodyX) + "," + (shoulderJointY + bodyY) + "l" + (-1 * footSpreadPx / 2) + "," + Math.max((bodyHeightPx - bodyY), 0));
//     backLeg1.attr("stroke-width", "2");
  
//     // Draw the second back leg, which points backward.
//     backLeg2 = paper.path("M" + (shoulderJointX + bodyX) + "," + (shoulderJointY + bodyY) + "l" + footSpreadPx / 2 + "," + Math.max((bodyHeightPx - bodyY), 0));
//     backLeg2.attr("stroke-width", "2");
  
//     // Draw the tail.
//     tailX = Math.cos(tailAngleRad) * tailLengthPx;
//     tailY = Math.sin(tailAngleRad) * tailLengthPx;
//     tail = paper.path("M" + (shoulderJointX + bodyX) + "," + (shoulderJointY + bodyY) + "l" + tailX + "," + tailY);
//     tail.attr("stroke-width", "2");
//   };
  