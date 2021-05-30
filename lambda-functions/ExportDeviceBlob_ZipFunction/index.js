var AWS = require('aws-sdk');
var S3Zipper = require('aws-s3-zipper');
AWS.config.update({region:'us-east-1'});
var ssm = new AWS.SSM({region:'us-east-1'});
var envPath = process.env.ssm_store;
var environment = {};
var zipper;
var exportBucket;

exports.handler = (event, context, callback) => {
    var envReq = getParameterFromSystemManager();
    envReq.then(() => {
        exportBucket = environment['envprefix'] + '-exportprocedurebucket';
        AWS.config.update({ region: 'us-east-1' });
        var s3 = new AWS.S3({ apiVersion: '2006-03-01' });
        var config = {            
            region: "us-east-1",
            bucket: exportBucket
        
        };
        zipper = new S3Zipper(config);

        var foldername = event['foldername'];
        var zipparams = {
            bucket: exportBucket,
            foldername: foldername,
        };
        createZip(zipparams);

        const myDestBucket = exportBucket+ '/' + foldername;
        const myKey = foldername + '.zip';
        const signedUrlExpireSeconds = 60 * 20;

        const url = s3.getSignedUrl('getObject', {
            Bucket: myDestBucket,
            Key: myKey,
            Expires: signedUrlExpireSeconds
        });

        callback(null, url);
    }).catch((err) => {
        console.log('GetSSMParam-error', err);
    });
};


function createZip(zipparams) {
    //-----------Zip folder----------------------// 

    console.log('createing zip');
    zipper.zipToS3File({
        s3FolderName: zipparams.foldername
        , startKey: null // optional
        , s3ZipFileName: zipparams.foldername + '.zip'
        , recursive: true
        , tmpDir: "/tmp"
    }, function (err, result) {
        if (err) {
            console.log('createing zip error', err);
        } else {
            console.log('zip created');
            var lastFile = result.zippedFiles[result.zippedFiles.length - 1];
            if (lastFile)
                console.log('last key ', lastFile.Key); // next time start from here
        }
    });

    //-----------Zip folder End----------------------// 
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