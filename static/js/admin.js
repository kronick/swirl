sequences = [];

$(document).ready(function() {
    // Get a list of sequences from the server and put their IDs in a list
    $.get("sequences", function(data) {
        for(var i=0; i<data["sequences"].length; i++) {
            var id = data["sequences"][i]["id"];
            sequences.push(id);
            var sequenceEl = $("<div class='sequence' data-id='" + id + "'></div>");
            var deleteEl = $("<div class='delete'>X</div>");
            $("#container").append(sequenceEl);
            sequenceEl.append(deleteEl);
            
            deleteEl.on("pointerup", function() {
                id = $($(this).parent()).attr("data-id");
                $.get("sequence/" + id + "/delete", function(data) {
                   $(".sequence[data-id=" + id +"]").fadeOut(); 
                });
            });

            var imageEl = $("<img src='sequence/" + id + "/gif'>");
            sequenceEl.append(imageEl);
            
            sequenceEl.on("pointerup", showSMSForm);
        }            
    });
});

function showSMSForm() {
    var id = $(this).attr("data-id");
    
}

function sendSMS(id, number) {
    var gif_url = "sequence/" + id + "/gif";
    $("#sendingSMSIndicator").show().transition({opacity: 1})
    $("#deliveryForm").fadeOut();
    // Sending the image data to Server
    $.ajax({
        type: 'POST',
        url: 'sms',
        data: '{ "phoneNumber" : "' + number + '", "gifURL" : "' + gif_url + '"}',
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