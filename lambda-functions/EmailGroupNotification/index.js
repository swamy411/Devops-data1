var aws = require('aws-sdk');
var http = require('http');
var ses = new aws.SES();
var ssm = new aws.SSM();
var envPath = process.env.ssm_store;
var environment = {};
var emailParams = {};

exports.handler = (event, context, callback) => {
    var envReq = getParameterFromSystemManager(envPath);
    envReq.then( async (env) => {
        environment = env;
        
        const notificationList = event.notificationList || [];
        const userList = event.userlist || [];
        
        console.log("---notificationList" + JSON.stringify(notificationList));
        console.log("---userList" + JSON.stringify(userList));

        let lang  = 'en';
        let ssmPath = '/emailGroupNotify/' + lang + '/';
        emailParams = await getParameterFromSystemManager(ssmPath) || {};
        
        notificationList.forEach((n) => {
            let notifyData = n;
            let selectedUsers = [];
            if(notifyData.toAllUsers === 'true' || (notifyData.toSurgeon === 'true' && notifyData.toHospitaladmin === 'true')) {
                selectedUsers = userList;
            } else if (notifyData.toSurgeon === 'true') {
                selectedUsers = userList.filter((u) => u.usertype === 'surgeon');
            } else if (notifyData.toHospitaladmin === 'true') {
                selectedUsers = userList.filter((u) => u.usertype === 'hospital_admin');
            }
            if (notifyData.incInActiveUsers === 'false') {
                let onlyActiveUsers = selectedUsers.filter((u) => u['status'] === 'Active');
                selectedUsers = onlyActiveUsers;
            }
            console.log("---notifyData---" + JSON.stringify(notifyData));
            console.log("---selectedUsers" + JSON.stringify(selectedUsers));
            let lastIndex = selectedUsers.length - 1;
            let anyFailure;
            selectedUsers.forEach((user, index) => {
                if (user.email) {
                    sendEmail(user, notifyData, (err, res) => {
                        if (err) {
                            anyFailure = true;
                            console.log(`===Email - NOT SENT ==Id=${notifyData.communicationid}===to=${user.username}==Error statusCode:=${err.statusCode}`);
                        } else {
                            console.log(`===Email - SENT ==Id=${notifyData.communicationid}===to=${user.username}`);
                        }
                        if (index === lastIndex && !anyFailure) {
                            updateNotificationStatus(notifyData);
                        }
                    });
                }
            });

        });

    }).catch((err) => {
        console.log('GetSSMParam-error', err);
    });
};


function sendEmail(toUser, notifyData, callback) {
    var eParams = {
        Destination: {
            ToAddresses: [toUser.email]
        },
        Message: {
            Body: {
                Html: {
                    Charset: "UTF-8",
                    Data: generateHTMLEmail(notifyData.messagebody)
                }
            },
            Subject: {
                Charset: "UTF-8",
                Data: notifyData.emailNotification
            }
        },
        // Replace source_email with your SES validated email address
        Source: "Smith&Nephew" + environment['id_emailsource']
    };

    ses.sendEmail(eParams, function (err, data) {
        if (err) {
            return callback(err, null);
        } else {
            return callback(null, data);
        }
    });
}

function generateHTMLEmail(message) {
    var emailHtml = emailParams['email_body_template'];
    var placeholderObj = {
        placehold_logopath: environment['url_intelliologo'],
        placehold_message: message
    };
    let reg = new RegExp(Object.keys(placeholderObj).join("|"),"gi");
    emailHtml = emailHtml.replace(reg, function(matched){
      return placeholderObj[matched];
    });
    return emailHtml;
}

function updateNotificationStatus(notifyData) {
    var data = JSON.stringify({
        "communicationid": notifyData.communicationid,
        "mode" : "email"
    });

    var headers = {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'lambda': '#1234lambd@_tr1gger4321#',
        'Authorization': 'Random Token'
    };

    var options = {
        host: environment['API_host'],
        path: '/communication',
        port: environment['API_port'],
        method: 'PUT',
        headers: headers
    };
       console.log("--update Notification API------ " + JSON.stringify(options) + 'Body: '+ data);
    // Set up the request
    var put_req = http.request(options, function (res) {
        if (res.statusCode != 201) {
            console.log(`===update Notification Error==Id=${notifyData.communicationid}=statusCode:=${res.statusCode}=Error=${res}`);
        } else {
            var str = '';
            res.on('data', function (chunk) {
                str += chunk;
            });

            res.on('end', () => {
                console.log(`===update Notification success ==Id=${notifyData.communicationid}==Result=${str}`);
            });
        }
    });
    put_req.write(data);
    put_req.end();

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
                console.log('env ', env);
                resolve(env);
            }
        });
    });
}