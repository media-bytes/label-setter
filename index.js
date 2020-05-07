const { Octokit } = require("@octokit/rest");
const prompts = require('prompts');

require('dotenv').config();

const labels = require('./labels.json');

let authToken = process.env.LABEL_AUTH_TOKEN || '';
let owner = process.env.LABEL_AUTH_ORG || '';
let octokit = null;

const getRepoChoices = async () => {
  const response = await octokit.repos.listForOrg({
    org: owner
  });

  return response.data.map(repo => {
    return {
      title: repo.name,
      value: repo.name
    }
  });
};

const selectRepoFromList = async () => {
  const repoChoices = await getRepoChoices();

  const response = await prompts({
    type: 'select',
    name: 'repo',
    message: 'Please select a repo:',
    choices: repoChoices
  });

  if (!('repo' in response)) {
    process.exit(0);
  }

  return response.repo;
};

const repoExists = async (repo) => {
  try {
    await octokit.repos.get({
      owner,
      repo,
    });
    
  } catch (err) {
    if (err.status === 404) {
      return false
    }

    throw err;
  }

  return true;
};

const getRepoName = async () => {
  let repoName = '';

  while (repoName == '') {
    const response = await prompts({
      type: 'text',
      name: 'repo',
      message: 'Which repo would you like to add labels to? (Hit Enter to select from a list)'
    });

    if (!('repo' in response)) {
      process.exit(0);
    }

    if (response.repo === '') {
      repoName = selectRepoFromList()
    } else {
      if (await repoExists(response.repo)) {
        repoName = response.repo;
      } else {
        console.log(`\r\nThe repo name '${response.repo}' does not exist. Please enter another.\r\n`)
      }
    }
  }

  return repoName;
};

const checkForExistingLabels = async (repo) => {
  const labels = await getLabels(repo);

  if (labels.length > 0 && await shouldDeleteAllLabels(labels.length)) {
    await deleteAllLabels(repo, labels);
  }
};

const getLabels = async (repo) => {
  const response = await octokit.issues.listLabelsForRepo({
    owner: owner,
    repo: repo
  });

  return response.data;
};

const shouldDeleteAllLabels = async (numLabels) => {
  const response = await prompts({
    type: 'confirm',
    name: 'shouldDelete',
    message: `\r\nThis repo already has ${numLabels} labels. Should we delete these existing labels?`,
    initial: false
  });

  if (!('shouldDelete' in response)) {
    process.exit(0);
  }

  return response.shouldDelete;
};

const deleteAllLabels = async (repo, labels) => {
  for (let i = 0; i < labels.length; i++) {
    await octokit.issues.deleteLabel({
      owner: owner,
      repo: repo,
      name: labels[i].name
    });
  }
};

const createLabel = async (repo, label) => {
  await octokit.issues.createLabel({
    owner: owner,
    repo: repo,
    name: label.name,
    color: String(label.color).substring(1),
    description: label.description
  });
};

const shouldOverwrite = async (labelName) => {
  const response = await prompts({
    type: 'confirm',
    name: 'shouldOverwrite',
    message: `\r\nThe label '${labelName}' already exists. Should we overwrite it?`,
    initial: false
  });

  if (!('shouldOverwrite' in response)) {
    process.exit(0);
  }

  return response.shouldOverwrite;
};

const updateLabel = async (repo, label) => {
  await octokit.issues.updateLabel({
    owner: owner,
    repo: repo,
    name: label.name,
    color: label.color,
    description: label.description
  });
};

const promptForAuthToken = async () => {
    const response = await prompts({
      type: 'text',
      name: 'authToken',
      message: 'What is your personal auth token?'
    });

    if (!('authToken' in response) || response.authToken == '') {
      process.exit(0);
    }

    return response.authToken;
};

const promptForOwner = async () => {
  const response = await prompts({
    type: 'text',
    name: 'owner',
    message: 'What organization would you like to use? (Hit enter to select from a list)'
  });

  if (!('owner' in response)) {
    process.exit(0);
  }

  return response.owner;
};

const getSetupVariables = async () => {
  if (authToken == '') {
    authToken = await promptForAuthToken();
  }
  
  if (owner == '') {
    owner = await promptForOwner();
  }
};

const setupOctokit = async () => {
  octokit = new Octokit({
    auth: authToken,
    userAgent: 'Label Setter v0.0.1',
    baseUrl: 'https://api.github.com'
  });
};

const getOrganizations = async () => {
  const response = await octokit.orgs.listForAuthenticatedUser();

  return response.data.map(org => {
    return {
      title: org.login,
      value: org.login
    }
  });
};

const selectOwnerFromList = async () => {
  const ownerChoices = await getOrganizations();

  const response = await prompts({
    type: 'select',
    name: 'owner',
    message: 'Please select an organization to select a repo from:',
    choices: ownerChoices
  });

  if (!('owner' in response)) {
    process.exit(0);
  }

  return response.owner;
};

const createLabels = async () => {
  await getSetupVariables();

  await setupOctokit();

  if (owner === '') {
    owner = await selectOwnerFromList();
  }

  const repo = await getRepoName();

  await checkForExistingLabels(repo);

  for (let i = 0; i < labels.length; i++) {
    console.log(`Creating label: ${labels[i].name}`)
    try {
      await createLabel(repo, labels[i]);
    } catch (err) {
      if (err.status === 422 && err.errors[0].code === 'already_exists') {
        if (await shouldOverwrite(labels[i].name)) {
          await updateLabel(repo, labels[i]);
        }
        continue;
      }

      throw err;
    }
  };

  console.log('Finished')
};

createLabels();
