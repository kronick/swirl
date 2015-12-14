active_sequences = [];

$(document).ready(function() {
    // Assign function to delete buttons
    $(".delete").on("pointerup", function() {
        id = $($(this).parent()).attr("data-id");
        $.get("sequence/" + id + "/delete", function(data) {
           //$(".sequence[data-id=" + id +"]").fadeOut(); 
        });
    });    
    
    window.setInterval(get_sequences, 5000);
});

function change_sequence(idx, id, delay) {
    var container = $($(".sequence")[idx]);
    var img = $(container.children("img.gif")[0]);

    var swirl = $(img.siblings(".swirl")[0]);
    swirl.stop().velocity({rotateZ: Math.random() * 360}, 0).velocity({rotateZ: "+=360"}, 6000, "linear");
    
    // Go away in a random direction
    var r = Math.random();
    var chain;
    chain = img.delay(delay);
    if(r < 0.25) {
        chain.transition({x: "1200px"}, 1000);      
    }
    else if(r < 0.5) {
        chain.transition({x: "-1200px"}, 1000);
    }
    else if(r < 0.75) {
        chain.transition({y: "1200px"}, 1000);
    }
    else {
        chain.transition({y: "-1200px"}, 1000);
    }
    
    // Change image and data-id
    window.setTimeout(function () {
        container.attr("data-id", id);
        img.attr("src", 'sequence/' + id + '/gif');
    }, 1000 + delay);
    
    // Re-enter from a random direction
    r = Math.random();
    if(r < 0.25) {
        chain.transition({x: "1200px", y: 0}, 0).transition({x: 0}, 1000);           
    }
    else if(r < 0.5) {
        chain.transition({x: "-1200px", y: 0}, 0).transition({x: 0}, 1000);
    }
    else if(r < 0.75) {
        chain.transition({y: "1200px", x: 0}, 0).transition({y: 0}, 1000);
    }
    else {
        chain.transition({y: "-1200px", x: 0}, 0).transition({y: 0}, 1000);
    }
}


var _cycle = 0;
function get_sequences() {
    $.get("sequences", function(data) {
        var recent_sequences = [];
        for(var i=0; i<data["sequences"].length; i++) {
            var id = data["sequences"][i]["id"];
            recent_sequences.push(id);
        }
        
        // Find which sequences should be deleted and which should be added
        var deleted_sequences = setOps.complement(active_sequences, recent_sequences);
        var new_sequences = setOps.complement(recent_sequences, active_sequences);
        
        // Force a transition in of any new sequences

        
        // Update the list of sequences to only the most recent ones returned by the server
        active_sequences = shuffle(recent_sequences);
        
        // Every time there is a new sequence or every n cycles, swap out images
        if(new_sequences.length > 0) {
            console.log(new_sequences);
            var id = new_sequences[0];
            $.get("sequence/" + id + "/gif", function () {
                change_sequence(1, id, 0);
                _cycle = 0; // Make sure new ones are shown for a while 
            })
        }
        else if(++_cycle % 8 == 0) {
            for(var idx=0; idx<3; idx++) {
                change_sequence(idx, active_sequences[idx], Math.random() * 1000);
            }
        }
    });
}


// --------------------------------------------
// UTILITIES


function shuffle(o){
    for(var j, x, i = o.length; i; j = Math.floor(Math.random() * i), x = o[--i], o[i] = o[j], o[j] = x);
    return o;
}