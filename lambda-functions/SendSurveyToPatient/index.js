var AWS = require('aws-sdk');
var http = require('http');
const fs = require('fs');
var ses = new AWS.SES();

AWS.config.update({accessKeyId: 'AKIAIX4WXWCVGHKCKTKA', secretAccessKey: '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', region: 'us-east-1'});
var s3 = new AWS.S3({apiVersion: '2006-03-01'});
exports.handler =  (event, context, callback) => {
     var  destBucket = 'dev-surveybucket';
     console.log(event)
     var tokenId =  event['tokenid'];  
     var surgeonemail = event['surgeonemail'];
     var surgeonphone = event['surgeonphonenumber'];
     var contactFlag = event['savecontactdetails'];
     console.log('contact flag = ',contactFlag);
     event['surveydetails'].forEach(function(item, index, array) {
      var foldername = item['surveyid']+Date.now();
      var path = '/survey/'+item['surveyid'];
      console.log('path---',path);
     updateStatus(item['gpid'],item['email'],item['phonenumber'],tokenId,contactFlag) ; 
    const myDestBucket = 'dev-surveybucket/'+foldername
    const myKey = 'surveyresponse.json';
    const signedUrlExpireSeconds = 60//60 * 21600

    const url = s3.getSignedUrl('putObject', {
    Bucket: myDestBucket,
    Key: myKey,
    Expires: signedUrlExpireSeconds,
    ContentType: 'application/json'
    
})
  
     const options = {
               host: '10.182.0.113',
               port: 8080,
               path: path,
               method: 'GET',
             headers: {
                'Content-Type': 'application/json',
                'Authorization': tokenId
            }
    };
    
     const req =  http.request(options, (res) => {
              console.log('Web service called and response code--',res.statusCode);
                   if(res.statusCode == 200) {
                     var str = '';
                  res.on('data', function(chunk) {
                      str += chunk;
                      console.log(chunk);
                  });
        res.on('end', () => {
            console.log('---', str)
            var strJson = JSON.parse(str);
      strJson['url'] = url;
      strJson['surgeonemail'] = surgeonemail;
      strJson['surgeonphonenumber'] = surgeonphone;
      console.log('--strJson--', strJson);
      str = JSON.stringify(strJson);
      console.log('--- Str json after append ---',str);
      
      
    fs.writeFile('/tmp/surveyrequest.json', str, function(err) {
    if(err) {
        return console.log(err);
    }else{
         var param = {
            Bucket: destBucket,
            Key: foldername+'/'+'surveyrequest.json',
            Body: fs.createReadStream('/tmp/surveyrequest.json'),
            Tagging: "DeleteTag=Delete"
        };
        var surveylink = event['surveylink'] + foldername;
        putObject(param,item['email'],item['phonenumber'],event['subject'],event['textmessage'],surveylink);
      }
   });
});
    
 } else {
     console.log('Error from web service' + res.statusCode);
 }
});

  req.on('error', (e) => {
              console.log('Error Message: ' + e.message);
            });
            
            console.log('End Data call');
            req.end();
        
     });
    
};

 function putObject(param,email,phone,subject,text,link,surgeonemail,surgeonphonenumber){
     s3.putObject(param, function(err, data){
      if(err)
       console.log(err);
        else{
          console.log(data);
          
        sendEmail(email,subject,text,link);
        sendSMS(phone,subject,text,link) ;
        }
         
        });
    }
    
 function sendEmail(email,subject,text,link) {
    var eParams = {
        Destination: {
            ToAddresses: [email]
        },
        Message: {
            Body: {
                Html: {
                 Charset: "UTF-8", 
                 Data: generateHTMLEmail(text,link)
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

function sendSMS(phone,subject,text,link){
    var params = {
  Message: (text).replace(/<br>/g, '\n')  + "\n \n" +link , /* required */
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
											 <p style='color:#505050'>${text} <br>${link} </p>
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

function updateStatus(gpid,email,phonenumber,tokenId,savecontactdetailsFlag){
     var bodyString;  
       const options = {
               host: '10.182.0.113',
               port: 8080,
               path: '/patient/procedure/contact',
               method: 'PUT',
             headers: {
                'Content-Type': 'application/json',
                'Authorization': tokenId
            }
    };
    
    if(savecontactdetailsFlag){
        bodyString = JSON.stringify({
           'gpid': gpid,
           'email': email,
           'phonenumber' : phonenumber
       }); 
    }else{
         bodyString = JSON.stringify({
           'gpid': gpid,
           'email': '',
           'phonenumber' : ''
       }); 
    }
    
      
	 http.request(options, putCallback).write(bodyString);
   }
   
     var putCallback = function(response) {
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
                    console.log('Success in updating contact information for the gpid  ',);
                } else {
                    console.error('Error in updating contact information for the gpid ');
                }
        });
    };