var async = require('async');
var AWS = require('aws-sdk');
var http = require('http');
const fs = require('fs');
var ses = new AWS.SES();

AWS.config.update({accessKeyId: 'AKIAIX4WXWCVGHKCKTKA', secretAccessKey: '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', region: 'us-east-1'});
var s3 = new AWS.S3({apiVersion: '2006-03-01'});


exports.handler =  (event, context) => {
    
     async.each(event.Records, processSingleEventRecord, context.done);
   
};


//Generic function to fetch the header, and extract the parameters
var processSingleEventRecord = function(event, callback){

    var bucket = event.s3.bucket.name;
    var key = decodeURIComponent(event.s3.object.key.replace(/\+/g, ' '));
    console.log('key---',key);
    var filename =  key.split('/');
    console.log('filename--',filename)
    if(filename[1]=='surveyresponse.json'){
        
      var params = {  Bucket: bucket, Key: filename[0] + '/surveyrequest.json' };
      
      s3.deleteObject(params, function(err, data) {
           if (err) console.log(err, err.stack);  // error
           else     console.log();                 // deleted
      });
      
        var getParams = {
             Bucket: bucket,
             Key: key
         }
    
    s3.getObject(getParams, function (err, data) {

      if (err) {
        console.log(err);
      } else {
          console.log('data---',data.Body);
        console.log(JSON.parse(data.Body)); //this will log data to console
        var requestBody = JSON.parse(data.Body); 
        console.log('Json',JSON.stringify(data.Body))
        
        
        var headers = {
                'Content-Type': 'application/json',
                'Content-Length': data.Body.length,
                'lambda': '#1234lambd@_tr1gger4321#'
            };
        
         var options = {
                //host: 'ec2-35-172-158-187.compute-1.amazonaws.com',
                host: '10.182.0.113',
                path: '/survey/response',
                port: 8080,
                method: 'POST',
                headers: headers
            };
        
            // Set up the request
  var post_req = http.request(options, function(res) {
      res.setEncoding('utf8');
      res.on('data', function (chunk) {
          console.log('Response: ' + chunk);
          
      });
      res.on('error', function (e) {
        console.log("Got error: " + e.message);
       
      });

  });

var jsonToSend = JSON.parse(data.Body);
  // post the data
  post_req.write(data.Body);
  post_req.end();
      
     
      }
      var text = "Patient responded to survey";
       sendEmail(requestBody['surgeonemail'],"Survey Responded",text)  ;  
        sendSMS(requestBody['surgeonphonenumber'],"Survey Responded",text);
      

     }) 
        
    }
  
};

function sendEmail(email,subject,text) {
    var eParams = {
        Destination: {
            ToAddresses: [email]
        },
        Message: {
            Body: {
                Html: {
                 Charset: "UTF-8", 
                 Data: generateHTMLEmail(text)
                }
            },
            Subject: {
                Data: subject
            }
        },

        // Replace source_email with your SES validated email address
        Source: "<snnoreply@maildrop.cc>"
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

function sendSMS(phone,subject,text){
    var params = {
  Message: (text).replace(/<br>/g, '\n'), /* required */
  PhoneNumber: phone,
};

// Create promise and SNS service object
var publishTextPromise = new AWS.SNS({apiVersion: '2010-03-31'}).publish(params).promise();

// Handle promise's fulfilled/rejected states
publishTextPromise.then(
  function(data) {
    console.log("MessageID is " + data.MessageId);
  }).catch(
    function(err) {
    console.error(err, err.stack);
  });
  
}
  
  function generateHTMLEmail(text,link) {
    return `
        <!DOCTYPE html>
         <html>
           <head>
             <meta charset='UTF-8' />
           </head>
           <body>
            <table border='0' cellpadding='0' cellspacing='0' height='100%' width='100%' id='bodyTable'>
             <tr>
                 <td align='center' valign='top'>
                     <table border='0' cellpadding='20' cellspacing='0' width='600' class='table' id='emailContainer'>
                         <tr style='background-color:#ffffff;'>
                             <td align='center' valign='top'>
                                 <table border='0' cellpadding='1' cellspacing='0' width='100%' class='table' id='emailBody'>
									 <tr>
										<td align='center'><img src="http://lenswebportal.s3-website-us-east-1.amazonaws.com/assets/images/smithAndNephew.jpg"/></td>
									 </tr>
                                     <tr>
                                         <td valign='top' style='color:#e25a0f;'>
											 <p style='color:#505050'>${text}</p>
                                         </td>
                                     </tr>
									 </tr>
                                 </table>
                             </td>
                         </tr>
                     </table>
                 </td>
             </tr>
             </table>
           </body>
		   <style>
		   .table{
			border-radius: 4px 4px 0 0;
			background-clip: padding-box;
			border: 1px solid #e2e2e2;
		   }
		   </style>
         </html>`
}  