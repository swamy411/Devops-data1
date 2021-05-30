var AWS = require('aws-sdk');
var http = require('http');
var s3 = new AWS.S3();
var ses = new AWS.SES();
var ssm = new AWS.SSM();
var envPath = process.env.ssm_store;
var environment = {};
var exportBucket;

exports.handler = (event, context,callback) => {      
    var envReq = getParameterFromSystemManager();
    envReq.then(() => {
        exportBucket = environment['envprefix'] + '-exportprocedurebucket';
        var bucket = '/'+ exportBucket + '/';
        var foldername = event['remotefolder'];
        var zippassword = event['zippassword'];
        var emailid = event['emailid'];
        const exportType = event['exporttype'] ? event['exporttype']: 'procedure';
        console.log('password = ',zippassword);
        console.log('foldername = ',foldername);
        console.log('emailid = ',emailid);

        const destBucket = bucket+foldername;
        const key = foldername+'.zip';
        const signedUrlExpireSeconds = 60 * 43200 ; //30 days

        const url = s3.getSignedUrl('getObject', {
            Bucket: destBucket,
            Key: key,
            Expires: signedUrlExpireSeconds
        });

        console.log('URL----'+url);

        sendEmail(emailid,url,zippassword,exportType);
                
        console.log('Zipper Ack Completed');
    }).catch((err) => {
        console.log('GetSSMParam-error', err);
    });
};

function sendEmail(email, link, zippassword, exportType) {
	var content = 'Your password is the combination of your username and last 5 digits of your mobile number. So if username is johndoe and mobile number is +19545012345, password is ‘johndoe12345’.<br>Please click the following link to download data: <br>' + link;
    var subjText = exportType === 'cancellation'? 'IMPORTANT: Your cancelled account data is now available. Please follow the attached link.':
        'IMPORTANT: Download patient record link is now available. Please follow the attached link.';
    var eParams = {
        Destination: {
            ToAddresses: [email]
        },
        Message: {
            Body: {
				  Html: {
				   Charset: "UTF-8",
				   Data: generateHTMLEmail(content)
					}            
				  },
            Subject: {
                Data: subjText
            }
        },
        // Replace source_email with your SES validated email address
        Source: "Smith&Nephew <snnoreply@maildrop.cc>"
    };

    ses.sendEmail(eParams, function(err, data){
        if (err) {
            console.log(err);
        } else {
            console.log("===EMAIL SENT===");
        }
    
    });
}  
 
 
 function generateHTMLEmail(emailDetails) {
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
										<td align='left'><div style="background-color:#ff8119;margin: auto;padding:5px 10px;">&nbsp;&nbsp; <img src=${environment['url_intelliologo']} /></div></td>
									 </tr>
                                     <tr>
                                         <td valign='top' style='color:#e25a0f;'>
											 <p style='color:#505050'>${emailDetails}</p>
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
         </html>`;
}

function getParameterFromSystemManager() {
    return new Promise((resolve, reject) => {
        var params = {
            Path: envPath,
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
                    key = key.replace(envPath, '');
                    key = key.replace('/', '_');
                    env[key] = eachItem.Value;
                });
                environment = env;
                resolve(true);
            }
        });
    });
}