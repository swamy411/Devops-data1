var aws = require('aws-sdk');
var http = require('http');
var ses = new aws.SES();
var ssm = new aws.SSM();
var cognitoidentityserviceprovider = new aws.CognitoIdentityServiceProvider();
var envPath = process.env.ssm_store;
var environment = {};

exports.handler = (event, context, callback) => {
    var envReq = getParameterFromSystemManager(envPath);
    envReq.then( async (env) => {
        environment = env;
        const options = {
            host: environment['API_host'],
            port: environment['API_port'],
            path: '/subscription/autoApproveTermination',
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Actor':'From TerminationAutoApproval function',
                'lambda': '#1234lambd@_tr1gger4321#'
            }
        };

         const req = http.request(options, (res) => {

             console.log('Web service called and response code--', res.statusCode);
             res.setEncoding('utf8');
             var str = '';
             res.on('data', function (chunk) {
                 console.log('Response: ' + chunk);
                 str += chunk;

             });
             res.on('error', function (e) {
                 console.log("Got error: " + e.message);

             });
             res.on('end', async function (e) {
                 console.log("Got : " + str);
                 var notifications = JSON.parse(str);
                 
                for (let j = 0; j < notifications.length; j++) {
                    console.log("notifications -" + notifications[j]);
                    var notification = notifications[j];
                    let surgeonMessage = '',
                        adminMessage = '',
                        ssmPath;
                    let placeholderObj = {
                        placehold_surgeonName: notification['surgeonName'],
                        placehold_adminName: notification['adminName'],
                        placehold_licenseId: notification['licenseId']
                    };
                    
                    let surgeonLang = await getUserLanguage(notification['surgeonid']);
                    ssmPath = '/termnAutoApprove/' + surgeonLang + '/';
                    let surgeonParams = await getParameterFromSystemManager(ssmPath) || {};
                    surgeonMessage = surgeonParams['email_surgeonMessage'];
                    surgeonMessage = replacePlacholders(surgeonMessage, placeholderObj);
                    console.log('---surgeonMessage--', surgeonMessage);
                    let adminLang  = await getUserLanguage(notification['adminid']);
                    ssmPath = '/termnAutoApprove/' + adminLang + '/';
                    let adminParams = await getParameterFromSystemManager(ssmPath) || {};
                    adminMessage = adminParams['email_adminMessage'];
                    adminMessage = replacePlacholders(adminMessage, placeholderObj);
                    console.log('---adminMessage--', adminMessage);
                    
                    sendEmail(notification['surgeonEmail'], surgeonParams['email_subject'], surgeonParams['email_body_template'], surgeonMessage);
                    if(notification['adminEmail']){
                        sendEmail(notification['adminEmail'], adminParams['email_subject'], adminParams['email_body_template'], adminMessage);
                    }
                } 
             });
         });    

         req.on('error', (e) => {
             console.log('Error Message: ' + e.message);
         });


         req.end();

    })
        .catch((err) => {
        console.log('GetSSMParam-error', err);
    });
};

function sendEmail(to, subject, template, body) {
    console.log('to');
    var eParams = {
        Destination: {
            ToAddresses: [to]
        },
        Message: {
            Body: {
                Html: {
                    Charset: "UTF-8",
                    Data: generateHTMLEmail(template, body)
                }
            },
            Subject: {

                Data: subject
            }
        },

        // Replace source_email with your SES validated email address
        Source: "Smith&Nephew" + environment['id_emailsource']
    };

    ses.sendEmail(eParams, function(err, data) {
        console.log('in sendemail');
        if (err) {
            console.log(err);
        } else {
            console.log("===EMAIL SENT===");
        }
    });
    console.log("EMAIL CODE END");
}

function getUserLanguage(username) {
    const params = {
        UserPoolId: environment['id_userpool'],
        Username: username
    };
    return new Promise((resolve, reject) => {
        cognitoidentityserviceprovider.adminGetUser(params, (errDetail, dataDetail) => {
            if (errDetail) {
                console.log('Error getUser', errDetail);
                resolve('en');
            } else {
                let attributes = dataDetail.UserAttributes;
                let langAttribute = attributes.filter((attribute) => {
                    return attribute.Name === 'custom:preferred_lang';
                });
                let preferredLang = langAttribute[0] ? langAttribute[0]['Value'] : 'en';
                resolve(preferredLang);
            }
        });
    });
}

function generateHTMLEmail(template, message) {
    var emailHtml = template;
    let placeholderObj = {
        placehold_logopath: environment['url_intelliologo'],
        placehold_message: message
    };
    emailHtml = replacePlacholders(emailHtml, placeholderObj);    
    return emailHtml;
}

function replacePlacholders(string, placeholderObj) {
    let str = string;
    let reg = new RegExp(Object.keys(placeholderObj).join("|"),"gi");
    str = str.replace(reg, function(matched){
      return placeholderObj[matched];
    });
    return str;
}

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