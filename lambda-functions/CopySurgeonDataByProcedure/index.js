var aws = require('aws-sdk');
var http = require('http');
var s3 = new aws.S3();
var ssm = new aws.SSM();
var envPath = process.env.ssm_store;
var environment = {};
var lensmediaBucket;

exports.handler = async(event, context) => {
      
    return await new Promise((resolve, reject) => {
        var envReq = getParameterFromSystemManager();
        envReq.then(() => {
            var gpid = event["gpid"];
            var surgeon = event["surgeon"];
            var destBucket = event["destBucket"];
            var destFolder = event["destFolder"];
            lensmediaBucket = environment['envprefix'] + '-lensmediabucket';

            const options = {
                host: environment['API_host'],
                port: environment['API_port'],
                path: "/subscription/procedure/" + gpid,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Actor': surgeon,
                    'lambda': '#1234lambd@_tr1gger4321#'
                }
            };

            const req = http.request(options, (res) => {
                
                console.log('Web service called and response code--', res.statusCode);
                
                if (res.statusCode == 200) {
                    var str = '';
                
                    res.on('data', function(chunk) {
                        str += chunk;
                    });

                    res.on('end', () => {
                        var obj = JSON.parse(str);

                        for (var i in obj) {
                            if (i == 'procedureinfo') {
                                var newObj = obj[i];
                                for (var k in newObj) {
                                    if (k == 'annotations') {
                                        var glabalannotations = newObj[k];

                                        glabalannotations.forEach((glabalannotationsitems, index) => {

                                            for (var key in glabalannotationsitems) {
                                                if (key == 'fileurl') {
                                                    if (glabalannotationsitems[key] != undefined) {
                                                        var innerpath = glabalannotationsitems[key];
                                                        var objectPath = lensmediaBucket+ '/' + innerpath;
                                                        var lastSpecialPosition = objectPath.lastIndexOf("/");
                                                        var destination = destBucket + "/" + destFolder + "/" + innerpath.substring(innerpath.indexOf("/") + 1, innerpath.lastIndexOf("/"));
                                                        var destKey = objectPath.substring(lastSpecialPosition + 1, objectPath.length);
                                                        copyObject(objectPath, destination, destKey);
                                                    }
                                                }
                                            }

                                        });

                                    }

                                }
                            }

                            if (i == 'camerasettings') {
                                var camerasettings = obj[i];

                                camerasettings.forEach((item, index) => {
                                    for (var key in item) {
                                        if (key == 'media') {

                                            var media = item[key];
                                            media.forEach((item1, index) => {
                                                for (var key in item1) {

                                                    if (key == 'fileurl') {
                                                        if (item1[key] != undefined) {
                                                            var innerpath = item1[key];
                                                            var mediaPath = lensmediaBucket+ '/' + item1[key];
                                                            var lastIndexMedia = mediaPath.lastIndexOf("/");
                                                            var destinationMedia = destBucket + "/" + destFolder + "/" + innerpath.substring(innerpath.indexOf("/") + 1, innerpath.lastIndexOf("/"));
                                                            var destMediaKey = mediaPath.substring(lastIndexMedia + 1, mediaPath.length);
                                                            copyObject(mediaPath, destinationMedia, destMediaKey);
                                                }
                                                    }
                                                    if (key == 'annotations') {

                                                        var localAnnotations = item1[key];

                                                        localAnnotations.forEach((localannotationsItem, index) => {
                                                            for (var key in localannotationsItem) {

                                                                if (key == 'fileurl') {
                                                                    if (localannotationsItem[key] != undefined) {
                                                                        var innerpath = localannotationsItem[key];
                                                                        var localannotationpath = lensmediaBucket+ '/' + localannotationsItem[key];
                                                                        var lastIndexLocal = localannotationpath.lastIndexOf("/");
                                                                        var destinationLocal = destBucket + "/" + destFolder + "/" + innerpath.substring(innerpath.indexOf("/") + 1, innerpath.lastIndexOf("/"));
                                                                        var destLocalKey = localannotationpath.substring(lastIndexLocal + 1, localannotationpath.length);
                                                                        copyObject(localannotationpath, destinationLocal, destLocalKey);
                                                                    }
                                                                }
                                                            }
                                                        });

                                                    }
                                                }

                                            });

                                        }


                                    }

                                });

                            }

                        }

                    });
                    resolve("success in calling dev_CopySurgeonDataByProcedure");
                } else {
                    console.log('Error from web service' + res.statusCode);
                    reject('Error from web service' + res.statusCode);
                }
            
            });

            req.on('error', (e) => {
                console.log('Error Message: ' + e.message);
            });

            console.log('End Data call');
            req.end();
        }).catch(() => {
            reject('Error from SSM Get param');
        });
    });
};


function copyObject(source, destination, destKey) {
    return new Promise((resolve, reject) => {
    s3.copyObject({
        CopySource: source,
        Bucket: destination,
        Key: destKey,
    }, function(copyErr, copyData) {
        if (copyErr) {
            console.log("copy source -" + JSON.stringify(source));
            console.log("copy destination -" + destination);
            console.log("copy destKey -" + destKey);
            console.log("Error in copying object--", copyErr);
            reject(false);
        } else {
            console.log('Object copied--' + destKey);
            resolve(true);
        }
    });
 });
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