var aws = require('aws-sdk');
var http = require('http');
var sns = new aws.SNS();
var ssm = new aws.SSM();
var envPath = process.env.ssm_store;
var environment = {};

exports.handler = (event, context, callback) => {
    var envReq = getParameterFromSystemManager();
    envReq.then(() => {
        
        const notificationList = event.notificationList || [];
        const userList = event.userlist || [];
        
        console.log("---notificationList" + JSON.stringify(notificationList));
        console.log("---userList" + JSON.stringify(userList));

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
                if (user.phonenumber) {
                    sendSMS(user, notifyData, (err, res) => {
                        if (err) {
                            anyFailure = true;
                            console.log(`===SMS - NOT SENT ==Id=${notifyData.communicationid}===to=${user.username}==Error statusCode:=${err.statusCode}`);
                        } else {
                            console.log(`===SMS - SENT ==Id=${notifyData.communicationid}===to=${user.username}`);
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


function sendSMS(toUser, notifyData, callback) {
    console.log("sending SMS  to  username - " + toUser.username);
    var params = {
        Message: notifyData.messagebody,
        PhoneNumber: toUser.phonenumber
    };

    sns.publish(params, function (err, data) {
        if (err) {
            return callback(err, null);
        } else {
            return callback(null, data);
        }
    });
}

function updateNotificationStatus(notifyData) {
    var data = JSON.stringify({
        "communicationid": notifyData.communicationid,
        "mode" : "sms"
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
                    key = key.replace(envPath , '');
                    key = key.replace('/', '_');
                    env[key] = eachItem.Value;
                });
                environment = env;
                resolve(true);
            }
        });
    });
}