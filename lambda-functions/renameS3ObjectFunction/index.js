var async = require('async');
var AWS = require('aws-sdk');
var s3 = new AWS.S3();
var ssm = new AWS.SSM();
var envPath = process.env.ssm_store;
var environment = {};
var lensmediaBucket;

//Lambda entry point
exports.handler = function(event, context) {
    var envReq = getParameterFromSystemManager();
    envReq.then(() => {
        lensmediaBucket = environment['envprefix'] + '-lensmediabucket';
        async.each(event.records, processSingleEventRecord, context.done);
    }).catch((err) => {
        console.log('GetSSMParam-error', err);
    });
};

var processSingleEventRecord = function(event, callback) {
    console.log('event-----', event);
    var srcKey = decodeURIComponent(event.srckey.replace(/\+/g, ' '));
    var source = lensmediaBucket+'/'+srcKey;
    var destination = lensmediaBucket+'/'+srcKey.substring(0, srcKey.lastIndexOf("/"));
    var destKey = event.newNameKey;
    var thumbnailKey = event.thumbnailKey ? 
        decodeURIComponent(event.thumbnailKey.replace(/\+/g, ' ')) : undefined;
    var Metadata = event.metaData;
    if(Metadata) {
        let headParam = {
            Bucket: lensmediaBucket,
            Key: srcKey
        };
        console.log('---headParam---',headParam);
        let existingMetadata = getExistingMetadata(headParam);
        existingMetadata.then((data) => {
            console.log('---existingMetadata-'+ JSON.stringify(data));
            if (data.upload === 'web') {
                Metadata['upload'] = 'web';
            }
            // for old local annotations
            copyObjectWithRename(source, destination, destKey, 'REPLACE', Metadata, srcKey, thumbnailKey);
        }).catch((err) => {
            console.log('existingMetadata-error', err);
        });
    } else {
        copyObjectWithRename(source, destination, destKey, 'COPY', null, srcKey, thumbnailKey);
    }
};

function copyObjectWithRename(source, destination, key, copyReplaceMetadata, Metadata, srcKey, thumbnailKey){
    s3.copyObject({ 
        CopySource: source,
        Bucket: destination,
        Key: key,
        MetadataDirective: copyReplaceMetadata,
        Metadata: Metadata,
        StorageClass : 'STANDARD'
    },function(copyErr, copyData){
        if (copyErr) {
            console.log("Error in copying object--",copyErr);
        } else {
            console.log('Object copied--key-'+key);
            if (srcKey && srcKey !== '') {
                var params = {
                    Bucket: lensmediaBucket, 
                    Key: srcKey
                };
            }
            deleteObject(params);
            if (thumbnailKey && thumbnailKey !== '') {
                var thumbParams = {
                    srcKey: thumbnailKey,
                    thumbnailNewname : 'Thumb_' + key.split('.')[0] + '.jpg',
                    destination: destination
                };
                console.log("-----thumbParams--", thumbParams);
                renameThumbnail(thumbParams);
            }
        } 
    });
}

function deleteObject(params){
    s3.deleteObject(params, function(err, data) {
        if (err) {
            console.log(err, err.stack); // an error occurred
            console.log('Error in deleting object--',params.Key);
        } else  {
            console.log(data);           // successful response
            console.log('Object deleted--',params.Key);

        }

    });
}

function renameThumbnail(params){
    s3.copyObject({ 
        CopySource: lensmediaBucket + '/' + params.srcKey,
        Bucket: params.destination,
        Key: params.thumbnailNewname,
        StorageClass : 'STANDARD'
    },function(copyErr, copyData){
        if (copyErr) {
            console.log("Error in copying thumnail--",copyErr);
        } else {
            console.log('Object copied--thumnail-'+ params.destination);
            var thumbParams = {
                Bucket: lensmediaBucket, 
                Key: params.srcKey
            };
            deleteObject(thumbParams);
        }
    });
}

function getExistingMetadata(params) {
    return new Promise((resolve, reject) => {
        s3.headObject(params, function(err, data) {
            if (err) {
                reject(false);
            } else {
                resolve(data.Metadata);
            }
            console.log('--getExistingMetadata---',err, data);
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