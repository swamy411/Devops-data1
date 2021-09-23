pipeline {
  agent any
  stages {
  stage('Stage 1') {
      steps {
        script {
            checkout([ $class: 'GitSCM', 
            branches: [[name: '*/master']], 
            doGenerateSubmoduleConfigurations: false, 
            extensions: [[
                $class: 'MessageExclusion', excludedMessage: '.*skip-?ci.*'
            ]], 
            userRemoteConfigs: [[
                credentialsId: '265ab289-8032-42d1-a86f-efd2114d49d9', url: 'git@github.com:swamy411/Devops-data1.git'
            ]]
            ])
        }
      }
    }
  }
}
