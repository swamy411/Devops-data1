var aws = require('aws-sdk');
var http = require('http');
var ses = new aws.SES();
var bodyString;
var lambda = new aws.Lambda({
  region: 'us-east-1' 
});
var ssm = new aws.SSM();
var envPath = process.env.ssm_store;
var environment = {};
var emailParams = {};

exports.handler = (event, context, callback) => {
    var envReq = getParameterFromSystemManager(envPath);
    envReq.then((env) => {
        environment = env;
        console.log(event);
        var path = '/patient/procedure/contact';
        var tokenId =  event['tokenid']; 
        var gpid = event['gpid'];
        var email=  event['email'];
        var saveContactDetailsFlag = event['saveContactDetailsFlag'];
        var phonenumber =  event['mobile'];
        if(event.email) {
            sendEmail(event);
        }
        if(event.mobile) {
            sendSMS(event);
        }

        if(saveContactDetailsFlag == true){
            bodyString = JSON.stringify({
                        'gpid': gpid,
                        'email':email,
                        'phonenumber':phonenumber
                    });
        }else{
                bodyString = JSON.stringify({
                        'gpid': gpid,
                        'email':"",
                        'phonenumber':""
                    });
        }     
        var surgeonid =  event.username;
        var ownerId =  event.ownerId;
        var headers = {
                    'Content-Type': 'application/json',
                    'Content-Length': bodyString.length,
                    'Authorization': tokenId,
                    'surgeonid': surgeonid
                };
        if (ownerId) {
            headers['ownerid'] = ownerId;
        }
        const options = {
                host: environment['API_host'],
                port: environment['API_port'],
                path: path,
                method: 'PUT',
                headers: headers
        };
    
        const req = http.request(options, (res) => {
            
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                console.log('Response: ' + chunk);
                
            });
            res.on('error', function (e) {
                console.log("Got error: " + e.message);
            
            });
        });

        // send the request
        req.write(bodyString);
        req.end();
    
    // http.request(options, putCall).write(bodyString);
    }).catch((err) => {
        console.log('GetSSMParam-error', err);
    });
};
 var putCall = function(response) {
        var statusCode = response.statusCode; 
        console.log(statusCode);
        var str = '';
        //another chunk of data has been recieved, so append it to `str`
        response.on('data', function(chunk) {
            str += chunk;
        });
        
        //the whole response has been recieved, so we just print it out here
            response.on('end', function() {
                
                if(statusCode == 202) {
                    console.log("Updated email and phone number successfully");
                } else {
                
                    console.log("Error in updating the email and phone number");
                }
        });
    };

async function sendEmail(emailDetails) {
    console.log(emailDetails);
    let lang  = 'en';
    let ssmPath = '/dataToPatient/' + lang + '/';
    emailParams = await getParameterFromSystemManager(ssmPath) || {};
    var subject = emailDetails.subject;
    var eParams = {
        Destination: {
            ToAddresses: [emailDetails.email]
        },
        Message: {
            Body: {
                Html: {
                 Charset: "UTF-8", 
                 Data: generateHTMLEmail(emailDetails)
                }
            },
            Subject: {
                Data: subject
            }
        },

        // Replace source_email with your SES validated email address
        Source: environment['id_emailsource']
    };

    ses.sendEmail(eParams, function(err, data){
        if (err) {
            console.log(err);
        } else {
            console.log("===EMAIL SENT===");
        }
    
    });
    console.log("EMAIL CODE END");
}

 function generateHTMLEmail(emailDetails) {
    var emailHtml = emailParams['email_body_template'];
    var placeholderObj = {
        placehold_logopath: environment['url_intelliologo'],
        placehold_message: emailDetails.textMessage,
        placehold_link: emailDetails.sharableLink
    };
    let reg = new RegExp(Object.keys(placeholderObj).join("|"),"gi");
    emailHtml = emailHtml.replace(reg, function(matched){
      return placeholderObj[matched];
    });    
    return emailHtml;
} 

function sendSMS(messageDetails){
    var params = {
  Message: (messageDetails.textMessage).replace(/<br>/g, '\n')  + "\n " +  messageDetails.sharableLink, /* required */
  PhoneNumber: messageDetails.mobile,
};

// Create promise and SNS service object
var publishTextPromise = new aws.SNS({apiVersion: '2010-03-31'}).publish(params).promise();
var strResponse = "SMS sent";   

// Handle promise's fulfilled/rejected states
publishTextPromise.then(
  (data)=> {
    console.log("MessageID is " + data.MessageId);
    const options = {
               host: environment['API_host'],
               port: environment['API_port'],
               path: '/webapp/sendDatatoPatientTextSecure',
               method: 'HEAD',
             headers: {
                'Content-Type': 'application/json',
                'Authorization': messageDetails['tokenid'],
                'gpid': messageDetails.gpid
            }
    };
    console.log(options);
     http.request(options,headCall).write(strResponse);
  }).catch(
    function(err) {
    console.error(err, err.stack);
  });
  
}

var headCall = function(response) {
        var statusCode = response.statusCode; 
        console.log(statusCode);
        var str = '';
        //another chunk of data has been recieved, so append it to `str`
        response.on('data', function(chunk) {
            str += chunk;
        });
        
        //the whole response has been recieved, so we just print it out here
            response.on('end', function() {
                
                if(statusCode == 202) {
                    console.log("sent SMS successfully");
                } else {
                
                    console.log("Error in sending SMS");
                }
        });
    };

function getParameterFromSystemManager(ssmpath) {
    return new Promise((resolve, reject) => {
        var params = {
            Path: ssmpath,
            /* required */
            WithDecryption: false,
            Recursive: true
        };
        ssm.getParametersByPath(params, function (err, data) {
            if (err) {// an error occurred
                reject(false);
            }
            else {// successful response
                let dataEnv = data.Parameters ? data.Parameters : [];
                let env = {};
                dataEnv.forEach((eachItem) => {
                    let key = eachItem.Name;
                    key = key.replace(ssmpath , '');
                    key = key.replace('/', '_');
                    env[key] = eachItem.Value;
                });
                resolve(env);
            }
        });
    });
}