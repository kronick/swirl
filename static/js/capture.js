var current_state;
var changing_states = false;

$(document).ready(function() { 
    current_state = states["launch"];
    current_state.enter();
});

faces = [];
current_sequence = -1;

_forceReady = false;

states = {
    "launch": {
        name: "launch",
        inlets: [],
        outlets: ["config", "showgif"],
        enter: function(prev) {
            set_status("configuring");
            
            // Initialize the camera and switch to config state when ready
            initializeCamera(function() {
                change_state("config");
                //change_state("showgif");
            });        
        
            // Assign functions to buttons
            $("#settingsIcon").on("pointerup", function() {
                change_state("config");
                // toggleSettings();
            });
            
            $("#startCapture").on("pointerup", function() {
                change_state("waitforall");
            });
            $("#skipWaiting").on("pointerup", function() {
                _forceReady = true;
            });
            
            $("#sendText").on("pointerup", function() {
                requestText(); 
            });
            
            $(".restart").on("pointerup", function() {
                change_state("attractor");
            });
            
            $(".number").on("pointerup", type_number);
        
            // Make sure scrolling is disabled everywhere
            $('body').bind('touchmove', function(e){e.preventDefault()})            
            
            rotateSpiral();
        },
        exit: function(next, complete) {
            complete();
        }
    },
    "config": {
        name: "config",
        inlets: ["launch", "alignface"],
        outlets: ["alignface", "attractor"],
        enter: function(prev) {
            // Check to see if current screen/cluster exists in database.
            // If it already exists and prev state was "launch" go straight to align face
            // Otherwise show the config screen
            if(prev == "launch") {
                _this = this;
                $.get("status", function(data) {
                    if(data["screen"]) {
                        console.log("This screen is already configured: ");
                        console.log(data["screen"]);
                        change_state("attractor");
                    } 
                    else {
                        _this.show();
                    }
                });
            }
            else this.show();
        },
        exit: function(next, complete) {
            fadezoomspinOut("#settings", 1000);
            $("#grayout").transition({opacity: 0}, function() { $("#grayout").hide() });

            window.setTimeout(complete, 1000)
        },
        show: function() {
            fadezoomspinIn("#settings", 1000);
            $("#grayout").css({opacity: 0}).show().transition({opacity: 1});
        }
    },
    "attractor": {
        name: "attractor",
        inlets: ["config", "alignface", "sendsms", "showgif"],
        outlets: ["alignface", "config"],
        enter: function(prev) {
            // Skip this state for now and flow through to align face
            clear_faces();
            window.setTimeout(function() { change_state("alignface") }, 100);
        },
        exit: function(next, complete) {
            complete();
        }
    },
    "alignface": {
        name: "alignface",
        inlets: ["attractor", "waitforall", "waitforturn"],
        outlets: ["waitforall", "config", "attractor"],
        enter: function(prev) {
            startVideoPreview("alignCanvas", true);
            fadezoomspinIn("#alignFaceView", 1000);
            stopSpiral();
        },
        exit: function(next, complete) {
            if(next == "waitforall") {
                fadezoomspinOut("#alignFaceView", 1000); 
                fadezoomspinOut("#menu", 1000);
                
                $("#bell" + ((Cookies.get("screen") % 3) + 1) + "Sound")[0].play();
            }
            window.setTimeout(function() { stopVideoPreview("alignCanvas"); complete(); }, 1000);
        }
    },
    "waitforall": {
        name: "waitforall",
        inlets: ["alignface"],
        outlets: ["capture", "waitforturn", "alignface"],
        enter: function(prev) {
            // Reset faces list
            clear_faces();
            
            var _this = this;
            set_status("waiting", function(data) {
                console.log(data["cluster"]);
                // Check if all screens are ready
                _this.moveOnIfClusterReady(data["cluster"]);
            })
            
            this.checkInterval = window.setInterval(function() {
                $.get("status", function(data) {
                    _this.moveOnIfClusterReady(data["cluster"]);
                });
            }, 500);
            
            rotateSpiral();
            $("#waitForOthersText").fadeIn();
            $("#skipWaiting").hide();
            _forceReady = false;
            window.setTimeout(function() {
                $("#skipWaiting").fadeIn();
            }, 10000)
        },
        exit: function(next, complete) {
            // Make sure this waiting loop interval is cleared
            window.clearInterval(this.checkInterval);
            
            if(next != "waitforturn")
                stopSpiral();
            
            $("#waitForOthersText").fadeOut();
            complete();
        },
        checkInterval: undefined,
        moveOnIfClusterReady: function(cluster) {

            if(!_forceReady) {
                // Loop through all screens in this cluster object and return false if any are not ready and waiting
                for(var i=0; i<cluster.length; i++) {
                    if(cluster[i].status != "waiting")
                        return false;
                }
            }
                        
            // Get the active sequence number
            $.get("nextSequence", function(data) {
                current_sequence = data;
                
                // Move on in the appropriate manner
                if(Cookies.get("screen") == 1) {
                    // Go straight to capture if this is screen #1
                    change_state("capture");
                }
                else {
                    // Wait for this screen's turn if it's anything other than #1
                    change_state("waitforturn");
                }  
            })
            
            return true;
        }
    },
    "capture": {
        name: "capture",
        inlets: ["waitforall", "waitforturn"],
        outlets: ["waitforturn"],
        enter: function(prev) {
            // TODO: Show countdown if coming from "waitforall" (this is the first picture in the sequence)
            update_images();
            
            $("#enterSound")[0].play();
            
            fadezoomspinIn("#captureView", 1000);
            startVideoPreview("captureCanvas");
    
            // Choose a random split screen view
/*
            $("#captureMask").removeClass("top bottom left right");
            //var classes = ["top", "left", "bottom", "right"];
            var classes = ["left","right","left","right"];
            var r = Math.floor(Math.random() * 4);
            $("#captureMask").addClass(classes[r]);
*/

            
            //$("#captureCanvas").css("opacity", 0.8);
            window.setTimeout(function() {
                triggerFlash();
                
                var facedata = document.getElementById("captureCanvas").toDataURL("image/jpeg").replace(/^data:image\/(png|jpg|jpeg);base64,/, "");
                $.ajax({
                    type: 'POST',
                    url: 'sequence/' + current_sequence + '/images',
                    data: '{ "face" : "' + facedata + '"}',
                    contentType: 'application/json; charset=utf-8',
                    dataType: 'json',
                    success: function (msg) {
                        console.log(msg);
                        change_state("waitforturn");
                    },
                    error: function (xhr, status) {
                        
                    }
                });

            }, 5500);
        },
        exit: function(next, complete) {
            fadezoomspinOut("#captureView", 1000);
            stopVideoPreview("captureCanvas");
            window.setTimeout(complete, 1000);
        }
    },
    "waitforturn": {
        name: "waitforturn",
        inlets: ["waitforall", "capture"],
        outlets: ["showgif", "capture", "alignface"],
        enter: function(prev) {
            // Start an interval time looking for a status change
            var _this = this;
            this.checkInterval = window.setInterval(function() {
                update_images();
                $.get("status", function(data) {
                    if(data["screen"]["status"] == "capturing")
                        change_state("capture")
                    else if(data["screen"]["status"] == "reviewing")
                        change_state("showgif")
                });
            }, 500);
            
            if(prev != "waitforall")
                rotateSpiral();
            
            //if(prev != "wairforall")
            //    $("#waitingContainer").css({opacity: 0}).show().transition({opacity: 1}, 400);
        },
        exit: function(next, complete) {
            window.clearInterval(this.checkInterval);
            //$("#waitingContainer").transition({opacity: 0}, 400);
            stopSpiral();
            
            complete();
        },
        checkInterval: undefined,
    },
    "showgif": {
        name: "showgif",
        inlets: ["waitforturn", "launch"],
        outlets: ["sendsms", "attractor"],
        enter: function(prev) {
            this.currentFace = 0;
            var _this = this;
            
            if(current_sequence == -1) current_sequence = 163;
            /*
            $("#reviewFaceA").attr("src", faces[0]).show();
            $("#reviewFaceB").attr("src", faces[1]).hide();
            */
            // Clear out old faces
            $("#reviewFaces").html("");
            
            $("#pingSound")[0].play();
            
            // Create a new img element for each face
            for(var i=0; i<faces.length; i++) {
                var newFaceEl = $("<img class='bigface animated'></img>");
                newFaceEl.attr("src", faces[i]);
                $("#reviewFaces").append(newFaceEl);
                if(i > 0) newFaceEl.hide();
            }
            
            fadezoomspinIn("#reviewView", 1000);
            fadezoomspinIn("#reviewFaces", 1000);
            $("#deliveryForm").show();
            $("#delivery").children(".status").hide();
            $("#phoneNumber").val("")
            $("#photoStrip").fadeOut();
            $("#keypad").show().css({display: "flex", opacity: 0}).transition({opacity: 1}, 1000);
            $("#delivery").fadeIn(1000);
            
            $("#enterNumber").show();
            
            this.animationTimer = window.setInterval(function() {
                var currentFaceIdx = -1;
                var reviewFaces = $("#reviewFaces").children(".bigface");
                for(var i=0; i<reviewFaces.length; i++) {
                    if($(reviewFaces[i]).is(":visible")) {
                        currentFaceIdx = i;
                        break;
                    }
                }
                
                $(reviewFaces[currentFaceIdx]).hide();
                $(reviewFaces[(currentFaceIdx + 1) % reviewFaces.length]).show();
                
                //$("#reviewFaceA").attr("src", faces[_this.currentFace++ % faces.length]);
            }, 120);
            
            // Request the GIF and replace it once loaded
            var thisthis = this;
            var gif_url = "sequence/" + current_sequence + "/gif";
            $.get(gif_url, function() {
                window.clearInterval(thisthis.animationTimer);
                $("#reviewFaces").children(".bigface").hide(); 
                $("#reviewFaces").append($("<img class='bigface' src='" + "sequence/" + current_sequence + "/gif' />"));
            });

        },
        exit: function(next, complete) {
            window.clearInterval(this.animationTimer);
            fadezoomspinOut("#reviewView", 1000);
            fadezoomspinOut("#reviewFaces", 1000);
            $("#photoStrip").fadeIn(1000);
            $("#delivery").fadeOut(1000);
            $("#keypad").fadeOut(1000);
            window.setTimeout(complete, 1000);
        },
        currentFace: 0,
        animationTimer: undefined,
    },
    "sendsms": {
        name: "sendsms",
        inlets: ["showgif"],
        outlets: ["attractor"],
        enter: function(prev) {
            
        },
        exit: function(next, complete) {
            complete();
        }
    }
};

function change_state(next) {
    next_state = states[next];
    // Check if this is a valid transition
    if(next_state != current_state && next_state.inlets.indexOf(current_state.name) != -1 && current_state.outlets.indexOf(next_state.name) != -1) {
        if(!changing_states) {
            console.log("Changing state from '" + current_state.name + "' to '" + next_state.name + "'")
            changing_states = true;
            $("#state").append(" -> " + next_state.name);
            current_state.exit(next_state.name, function() {
                next_state.enter(current_state.name);
                changing_states = false;
                current_state = next_state;
            });
        }
        else {
            console.log("Already busy changing states! BE PATIENT OR FIX TRANSITIONS");
        }    
    }
    else {
        console.log("INVALID STATE CHANGE");
        console.log("Current state: " + current_state.name);
        console.log("Outlets: " + current_state.outlets);
        console.log("Desired state: " + next_state.name);
        console.log("Inlets: " + next_state.inlets);
    }
    
}

function set_status(status, handler) {
    // Post the new status to the server
    $.post("status", { "status": status }, handler)
}

function clear_faces() {
    faces.length = 0;
    //$("#photoStrip").children().remove();
    $("#photoStrip").children("img").attr("src", "");
     $("#inspirationFace").attr("src", "");
}

function update_images() {
    $.get("sequence/" + current_sequence + "/images", function(data) {
        images = data["photos"]
        idx = 0;
        
        if(images[images.length-1]["screen"] == Cookies.get("cluster") + "." + Cookies.get("screen")) {
            idx = images[images.length-2]["id"];
        }
        else {
            idx = images[images.length-1]["id"];
        }
        $("#inspirationFace").attr("src", "images/" + idx);
        
        if(images.length > faces.length) {
            // Add new images to faces list and create elements in the photo strip section
            for(var i=faces.length; i<images.length; i++) {
                var src = "images/" + images[i]["id"];
                faces.push(src);
                //var img = $("<img src='" + src + "'/>");
                //$("#photoStrip").append(img);
                var img = $($("#photoStrip").children("img")[i]);
                img.attr("src", src);
                
                img.css({"opacity": 0}).transition({opacity: 1, scale: 0.01}, 300).transition({scale: 1.5}, 300).transition({scale: 1.0}).transition({perspective: "100px", rotateY: (Math.random() - 0.5) * 30, rotate: (Math.random() - 0.5) * 5}, 3000);
                
            }
        }
    })   
}


function initializeCamera(ready, fail) {
    // Request the user's camera and initialize it
    var hdConstraints = {
    video: {
        mandatory: {
          maxWidth: 640,
          maxHeight: 640    
            }
          }
    };

    navigator.webkitGetUserMedia(hdConstraints, function(localMediaStream) {
        var video = document.querySelector('video');
        video.src = window.URL.createObjectURL(localMediaStream);

        video.onloadedmetadata = function(e) {
            // Video capture is ready to go. Do some setup stuff.
            var v = document.getElementById('videoPreview');
            var canvas = document.getElementById('alignCanvas');
            var context = canvas.getContext('2d');

            canvas.width = 400;
            canvas.height = 400;

            ready();
        };
    }, function(e) { console.log('webkitGetUserMedia reeeejected! ', e); fail(); });

}

function fadezoomspinIn(el, duration) {
     $(el).css({opacity: 0, scale: 0.1, perspective: "1000px", rotateY: 0, rotate: 30}).show().transition({opacity: 1, scale: 1, rotateY: 360, rotate: 0}, duration);
    //$(el).css({opacity: 0, scale: 0.1, rotate: 0}).show().transition({opacity: 1, scale: 1, rotate: 360*2}, duration);
}
function fadezoomspinOut(el, duration) {
    $(el).transition({opacity: 0, scale: 0.1,  rotate: -630}, duration, function() { $(el).hide(); });
    //$(el).transition({opacity: 0, scale: 0.1,  rotate: 0}, duration, function() { $(el).hide(); });
}

var _videoPreviewRunning = false;
var _videoPreviewDrawBox = true;
var _videoPreviewStrobe = false;
var _previewContext, _previewCanvas, _previewVideoScale, _previewVideo, _previewVideo_w, _previewVideo_h, _previewFrame;
function startVideoPreview(canvasID, drawBox) {
    _videoPreviewDrawBox = drawBox;
    _previewVideo = document.getElementById('videoPreview');
    _previewCanvas = document.getElementById(canvasID);
    _previewContext = _previewCanvas.getContext("2d");

    _previewCanvas.width = 400;
    _previewCanvas.height = 400;

    _previewVideo_w = $("#videoPreview").width();
    _previewVideo_h = $("#videoPreview").height();

    _previewVideoScale = (_previewVideo_w > _previewVideo_h) ? (1.0 * _previewCanvas.height / _previewVideo_h) : (1.0 * _previewCanvas.width / _previewVideo_w)

    _videoPreviewRunning = true
    $("#videoPreview").hide()
    $(_previewCanvas).show().css("opacity", 0).transition({opacity: 1})

    _previewFrame = 0;
    
    //window.requestAnimationFrame(getVideoPreviewFrame)
    window.setTimeout(getVideoPreviewFrame, 16);
}

function stopVideoPreview(canvasID) {
    _videoPreviewRunning = false
    $("#" + canvasID).transition({opacity: 0})
}

function getVideoPreviewFrame() {
    if(!_videoPreviewRunning) return;
    
    _previewContext.save()
    _previewContext.scale(-1, 1);
    _previewContext.translate(-_previewCanvas.width, 0)

    if(_previewVideo_w > _previewVideo_h)
        _previewContext.drawImage(_previewVideo,(_previewCanvas.width - _previewVideoScale*_previewVideo_w) / 2,0,_previewVideo_w * _previewVideoScale,_previewCanvas.height);
    else
        _previewContext.drawImage(_previewVideo,0,(_previewCanvas.height - _previewVideoScale*_previewVideo_h) / 2,_previewCanvas.width, _previewVideo_h * _previewVideoScale);

    _previewContext.restore()

    _previewContext.beginPath();
    _previewContext.lineWidth = 30;
    var t = new Date().getTime();
    var alpha = (Math.cos(t / 200) + 1) / 2 * .3 + 0.3;
    // console.log(alpha)
    _previewContext.strokeStyle = "rgba(255,255,255," + alpha + ")";
    //_previewContext.arc(_previewCanvas.width / 2, _previewCanvas.height * .4, _previewCanvas.width * 0.33, 0, 2 * Math.PI)
    var s = _previewCanvas.width / 2;
    _previewContext.save();
    if(_videoPreviewDrawBox) {
        _previewContext.translate(_previewCanvas.width / 2, _previewCanvas.height * 0.4);
        _previewContext.rotate(Math.cos(t/150) * 0.02);
        _previewContext.scale(Math.cos(t/200) * 0.02 + 1, Math.cos(t/200) * 0.02 + 1);
        _previewContext.strokeRect(  -s/2, -s/2, s, s);
        _previewContext.stroke();
    }
    _previewContext.restore();
    //window.requestAnimationFrame(getVideoPreviewFrame)
    
    if(_previewFrame++ % 5 == 0) {
        $(_previewCanvas).css("opacity", 0);
    }
    else {
        $(_previewCanvas).css("opacity", 1);
    }
    window.setTimeout(getVideoPreviewFrame, 32);
}


var currentAnimationFrame = 1;
var n_frames = 5;
function animatePreview() {

    old_frame = currentAnimationFrame;
    new_frame = old_frame + 1;
    if(new_frame > n_frames) new_frame = 1;
    currentAnimationFrame = new_frame;

    $("#face" + new_frame).show()
    $("#face" + old_frame).hide()

    window.setTimeout(animatePreview, 400);
}

function type_number(el) {
    var number = $(this).text();
    if(number != "del" && number != "enter") {
        $("#phoneNumber").val($("#phoneNumber").val() + number);
    }
    else if(number == "del") {
        $("#phoneNumber").val($("#phoneNumber").val().substr(0,$("#phoneNumber").val().length-1));
    }
    else {
        requestText();
    }
    
    $(this).css("background-color", "blue");
    var thisthis = this;
    window.setTimeout(function() {
       $(thisthis).css("background-color", ""); 
    }, 300);
}
function requestText() {
    $(".status").fadeOut();
    if($("#phoneNumber").val() != "" && $("#phoneNumber").val().match(/\d/g).length>=10) {
        // Likely a valid number
        
        var gif_url = Cookies.get("event") + "/" + current_sequence + "/gif";
        $("#sendingSMSIndicator").show().transition({opacity: 1})
        $("#deliveryForm").fadeOut();
        // Sending the image data to Server
        $.ajax({
            type: 'POST',
            url: 'sms',
            data: '{ "phoneNumber" : "' + $("#phoneNumber").val() + '", "gifURL" : "' + gif_url + '"}',
            contentType: 'application/json; charset=utf-8',
            dataType: 'json',
            success: function (msg) {
                console.log("SMS request sent: " + msg["status"] + " " + msg["message"])
                $("#textSuccessful").fadeIn();

                // TODO: Show link to reset
            },
            error: function (xhr, status) {
                console.log("Error sending SMS: " + status)
                // Show an error
                if(_textAttempts++ < 5) {
                    $("#textError").fadeIn();
                }
                else {
                    // Too many failures just give up and restart
                    change_state("attractor");
                }

                $("#sendingSMSIndicator").transition({opacity: 0}, 400, function() {
                    $("#sendingSMSIndicator").hide()
                    $("#deliveryForm").fadeIn();
                })

            }
        });
    }
    else {
        $("#badNumber").fadeIn()
    }
}

function triggerFlash() {
    $("#snapSound")[0].play()
    $("#flash").show().css("opacity", 1).delay(300).transition({opacity: 0}, 1000)
}

function rotateSpiral() {
    $("#waitingContainer").css({opacity: 0}).show().transition({opacity: 1}, 400);
    $("#waitingContainer").children("img").velocity({rotateZ: "+=36000"}, 600000, "linear");               
}
function stopSpiral() {
    $("#waitingContainer").stop().transition({opacity: 0}, 400);    
}


var _restartTimer
var _isResetting = false
var _textAttempts = 0
function restart() {
    if(_isResetting) return

    _isResetting = true
    clearRestartTimeout()

    $(".view").transition({opacity: 0}, 1000, function() {
        $(".view").hide()
    })
    
    //setStatus("configuring")
    
    window.setTimeout(function() {
/*
        $("#attractorView").show().transition({opacity: 1}, 500, function() {
            _isResetting = false
        })
        
*/
        startVideoPreview();
        $("#instructionsView").fadeOut();
        //$("#alignFaceView").show().css("opacity", 0).transition({opacity: 1}, 1000)
        fadezoomspinIn("#alignFaceView", 1000);
//         $("#alignFaceView").css({ "scale": 0.01}).transition({scale: 1.0}, 800)
    }, 1000)

    _textAttempts = 0
    $("#phoneNumber").val("")
}


function setRestartTimeout(delay) {
    clearRestartTimeout()
    _restartTimer = window.setTimeout(restart, delay)
}

function clearRestartTimeout() {
    if(typeof _restartTimer !== 'undefined')
        window.clearTimeout(_restartTimer)
}



// --------------------------------------------
// UTILITIES


function shuffle(o){
    for(var j, x, i = o.length; i; j = Math.floor(Math.random() * i), x = o[--i], o[i] = o[j], o[j] = x);
    return o;
}