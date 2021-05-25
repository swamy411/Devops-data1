const s3Util = require('./s3-util'),
	childProcessPromise = require('./child_process_promise'),
	path = require('path'),
	os = require('os'),
	EXTENSION = ".jpg",
	THUMB_WIDTH = 300,
	OUTPUT_BUCKET =  "swamy-layers-test-main",
	MIME_TYPE =  "image/jpeg";

exports.handler = function (eventObject, context){
	//const eventRecord = eventObject.Records && eventObject.Records[0] ,
	const	inputBucket = "swamy-layers-test-main",
		key = "desktopImage.jpg",
		id = context.awsRequestId,
		resultKey = "new_" + key.replace(/\.[^.]+$/, EXTENSION),
		workdir = os.tmpdir(),
		inputFile = path.join(workdir,  id + path.extname(key)),
		outputFile = path.join(workdir, id + EXTENSION);


	console.log('converting', inputBucket, key, 'using', inputFile);
	return s3Util.downloadFileFromS3(inputBucket, key, inputFile)
		.then(() => childProcessPromise.spawn(
			'/opt/ffmpeg',
			['-loglevel', 'error', '-y', '-i', inputFile, '-vf', `thumbnail,scale=${THUMB_WIDTH}:-1`, '-frames:v', '1', outputFile],
			{env: process.env, cwd: workdir}
		))
		.then(() => s3Util.uploadFileToS3(OUTPUT_BUCKET, resultKey, outputFile, MIME_TYPE));
};
