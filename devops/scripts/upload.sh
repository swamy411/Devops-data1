#!/bin/bash

CI_PROJECT_DIR=$1

echo "S3 Bucket Name: ${S3_BUCKET}"


    sam package --template-file $WORKSPACE/$lambda/template.yaml --s3-bucket $BUCKET --output-template-file build/output.yaml

