var async = require('async');
var http = require('http');
//var https = require('https');
var AWS = require('aws-sdk');
AWS.config.update({ region:'us-east-1' });
var s3 = new AWS.S3({ apiVersion: '2006-03-01' });
var lambda = new AWS.Lambda({
  region: 'us-east-1' 
});

var bucket;
var key;


//Lambda entry point
exports.handler = function(event, context) {
       console.log(event.Records[0].s3.bucket.name);
    
        console.log('End of putCallback');
	    //S3 sends a batch of events.  Need to handle the possibility of mutliple upload events
    async.each(event.Records, processSingleEventRecord, context.done);
};

    // Generic  function to fetch the header, and extract the parameters
var processSingleEventRecord = function(event, callback){

    bucket = event.s3.bucket.name;
    key = decodeURIComponent(event.s3.object.key.replace(/\+/g, ' '));
    
    var params = {
  Bucket: bucket, 
  Key: key, 
  Tagging: {
   TagSet: [
      {
     Key: "DeleteTag",
     Value: "Delete"
    }
   ]
  }
 };
 s3.putObjectTagging(params, function(err, data) {
   if (err) console.log(err, err.stack); // an error occurred
   else     console.log(data);           
     // successful response
   /*
     data = {
        VersionId: "null"
      }
      */
 });
    var params = {
        Bucket: bucket,
        Key: key
    };
    console.log('Put event received for bucket: ' + bucket + ', key: ' + key);

};
