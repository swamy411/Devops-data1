#!/bin/bash

#INPUTS
CI_PROJECT_DIR=$1
COMMIT_SHA=$( git rev-parse HEAD )


#DEFAULTS
#Ignore Other Folders to Ignore During Build.
ignore_list=("devops")
ignore_yml=("lambdas-version.yaml")
ignore_env=(".env")
ignore_build=("build.sh")
ignore_deploy=("deploy.sh")
ignore_upload=("upload.sh")

# #Identify the Affected Lambdas

mapfile -t lines < <(git diff-tree --no-commit-id --name-only -r "${COMMIT_SHA}" | grep ./ | cut -d/ -f3 | uniq )

# mapfile -t lines < <(git diff-tree --no-commit-id --name-only -r "${COMMIT_SHA}" | grep ./ | tr "/" " "| uniq )

echo "Lines Value---: ${lines}"

affected_folders=("$(printf '%s\n' "${lines[@]}" | sort -r)")
echo "Affected Folders : ${affected_folders[*]}"

#Testing
#affected_folders=("lambda-B")
echo "Affected Folders : ${affected_folders[*]}"

build_all_lambdas=false

echo "Stack Operation: ${OPERATION}"
if [ "${OPERATION}" == "create" ]; then 
    build_all_lambdas=true
fi

echo "Build All Lambdas ? ${build_all_lambdas}"

compile_lambdas() {
    src_path=( $@ )
    echo $@
    echo "SRC PATH @ : ${src_path[@]}"
    echo $(pwd)
    ListDir=$(ls ${CI_PROJECT_DIR}/lambda_functions/${STAGE}-lambdas)
    echo "List Dir:-- ${ListDir[@]}"
    cd "${CI_PROJECT_DIR}" || exit
    for folder in ${src_path[@]}; 
    do 
        if [[ "${ignore_list[@]}" =~ ${folder} ||  "${ignore_yml[@]}" =~ ${folder} || "${ignore_env[@]}" =~ ${folder} || "${ignore_build[@]}" =~ ${folder} || "${ignore_deploy[@]}" =~ ${folder} || "${ignore_upload[@]}" =~ ${folder} ]]; then
            continue
        fi
        
        if [ "${folder}" == "" ]; then 
            exit
        fi
        
        echo "Folder Name :--- ${folder}"
        cd "${CI_PROJECT_DIR}/lambda_functions/${STAGE}-lambdas/$folder" || exit
        npm install

        echo $(ls ${CI_PROJECT_DIR}/lambda_functions/${STAGE}-lambdas/$folder)
        sleep 20 &

        wait $! 

        echo "Packaging Lambda Artifacts"
        mkdir -p "${CI_PROJECT_DIR}/artifacts/lambdas"
        #zip -r -j "${CI_PROJECT_DIR}/artifacts/lambdas/${folder}.zip" .
        "C:\Program Files\WinRAR\WinRAR.exe" a -afzip "${CI_PROJECT_DIR}/artifacts/lambdas/${folder}.zip" .
        # "C:\Program Files\7-Zip\7z.exe" a -tzip "${CI_PROJECT_DIR}/artifacts/lambdas/${folder}.zip" "${CI_PROJECT_DIR}/artifacts/lambdas"
        
    done;
}

if [ "$build_all_lambdas" = true ] ; then
    echo 'Building All Lambdas'
    cd "${CI_PROJECT_DIR}/lambda_functions/${STAGE}-lambdas" || exit
    LAMBDAS=$( ls -d ${STAGE}_* )
    compile_lambdas "${LAMBDAS[@]}"
else
    echo "Compiling below lambdas: ${affected_folders[*]}"
    compile_lambdas "${affected_folders[@]}"
fi
