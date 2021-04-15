var AWS = require('aws-sdk');
var ssm = new AWS.SSM();
var envPath = process.env.ssm_store;
var environment = {};
var s3 = new AWS.S3();
var exportBucket;


exports.handler = (event) => {
    var envReq = getParameterFromSystemManager();
    envReq.then(() => {
        var foldername = event['mrnnumber'];
        exportBucket = environment['envprefix'] + '-exportprocedurebucket';
        var params = {
            Bucket: exportBucket,
            Prefix: foldername
        };

        s3.listObjects(params, function (err, data) {
            if (err) {
                console.log(err, err.stack); // an error occurred
            } else {

                if (data['Contents'] != undefined) {
                    data['Contents'].forEach((value, index) =>{
                        console.log(index + ' ' + value['Key']);

                        var params = {
                            Bucket: exportBucket,
                            Key: value['Key']
                        };

                        console.log('This object will be deleted before copy---', value['Key']);
                        s3.deleteObject(params, function (err, data) {
                            if (err) {
                                console.log(err, err.stack); // an error occurred
                            } else {
                                console.log('Object deleted successfully--', params.Key);
                            }
                        });

                    });

                }
            }
        });
    }).catch((err) => {
        console.log('GetSSMParam-error', err);
    });
};

function getParameterFromSystemManager() {
    return new Promise((resolve, reject) => {
        var params = {
            Path: envPath,
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
