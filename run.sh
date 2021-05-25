#!/bin/bash
WORKSPACE=$( pwd )

# shellcheck source=/dev/null
. "${WORKSPACE}/devops/scripts/.env"

#Clean Up Previous Build Artifacts
rm -rf artifacts

#Compiling Affected Lambdas
./devops/scripts/build.sh "${WORKSPACE}"

#Uploading Artifacts to S3 Bucket
./devops/scripts/upload.sh "${WORKSPACE}"

#Deploy Artifacts to AWS Lambda using Cloud Formation
./devops/scripts/deploy.sh "${WORKSPACE}"
