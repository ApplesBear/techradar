import { Octokit } from 'https://cdn.skypack.dev/octokit';

const startBtn = document.querySelector('button');
const downloadBtn = document.querySelector('.download');
const state = document.querySelector('.state');
let owner, octokit;

startBtn.addEventListener('click', techRadar);

async function techRadar() {
  startBtn.disabled = true;
  downloadBtn.disabled = true;
  state.innerText = '\n🏁 Please, wait';

  setVariables();

  const repositories = await getFrontendRepositories();
  const packageJsonFiles = await getPackageJsonFiles(repositories);
  const dependencies = await getAllDependencies(packageJsonFiles);

  if (Object.keys(dependencies).length > 0) {
    enableResultDownloading(dependencies);
  } else {
    state.innerText =
      '\n😔 Sorry, we did not find any dependencies. Are you sure your repositories have "frontend" topic?';
  }

  state.innerText += '\n ✅ Done. Please, download your result';
}

function setVariables() {
  const token = document.querySelector('.token').value;
  owner = document.querySelector('.owner').value;
  octokit = new Octokit({
    auth: token,
  });
}

async function getFrontendRepositories() {
  state.innerText += `\n 👷‍♀️ Getting repositories from ${owner}`;

  const repositoriesArray = await getRepositories();
  let result = [];

  state.innerText += `\n🥳 We've found ${repositoriesArray.length} repositories`;
  state.innerText += '\n🕵️‍♀️ Filter frontend repositories';

  result = repositoriesArray.filter(({ topics, archived, name }) => topics.includes('frontend') && !archived);

  state.innerText += `\n🥳 We found ${result.length} frontend repositories`;

  return result;
}

async function getPackageJsonFiles(repositories) {
  const packageJsons = [];

  for (let i = 0; i < repositories.length; i++) {
    state.innerText += `\n🔎 Looking for package.json files in ${repositories[i].name}`;

    const commitsArray = await getCommits(repositories[i].name);

    const headCommit = commitsArray.shift();

    const treeArray = await getTree(
      repositories[i].name,
      headCommit.commit.tree.sha
    );

    await parseNextTreeLvl(repositories[i], treeArray, packageJsons, 1);
  }

  state.innerText += `\n🥳 We've found ${packageJsons.length} package.json files`;

  return packageJsons;
}

async function parseNextTreeLvl(repo, tree = [], results, depth) {
  const treeArray = tree.filter((element) => {
    if (element.path === 'package.json') {
      results.push({
        repo_name: repo.name,
        sha: element.sha,
      });
    }

    return element.type === 'tree';
  });

  if (depth > 3) {
    return;
  }

  depth++;

  for (let i = 0; i < treeArray.length; i++) {
    const nextTreeArray = await getTree(repo.name, treeArray[i].sha);
    await parseNextTreeLvl(repo, nextTreeArray, results, depth);
  }
}

async function getAllDependencies(packageJsons) {
  const dependencies = {};

  for (let i = 0; i < packageJsons.length; i++) {
    state.innerText += `\n 🤔 Parsing package.json file in repo ${packageJsons[i].repo_name}`;

    const file = await getPackageJson(
      packageJsons[i].repo_name,
      packageJsons[i].sha
    );
    const json = JSON.parse(atob(file.content));

    getDependenciesFromJson(packageJsons[i].repo_name, json, dependencies);
  }

  state.innerText += `\n We've found ${
    Object.keys(dependencies).length
  } dependencies.`;

  return dependencies;
}

function getDependenciesFromJson(repo_name, json, dependencies) {
  for (const dependency in json.dependencies) {
    if (!(dependency in dependencies)) {
      dependencies[dependency] = {
        uses: 0,
        versions: [],
        repos: [],
      };
    }
    dependencies[dependency].uses++;
    dependencies[dependency].versions.push(json.dependencies[dependency]);
    dependencies[dependency].repos.push({
      name: repo_name,
      version: json.dependencies[dependency],
    });
  }

  for (const dependency in json.devDependencies) {
    if (!(dependency in dependencies)) {
      dependencies[dependency] = {
        uses: 0,
        versions: [],
        repos: [],
      };
    }
    dependencies[dependency].uses++;
    dependencies[dependency].versions.push(json.devDependencies[dependency]);
    dependencies[dependency].versions = [
      ...new Set(dependencies[dependency].versions),
    ];
    dependencies[dependency].repos.push({
      name: repo_name,
      version: json.devDependencies[dependency],
    });
  }
}

function enableResultDownloading(result) {
  const string_result = JSON.stringify(result, undefined, 2);
  const blob_result = new Blob([string_result], {
    type: 'application/json',
  });

  const link = document.createElement('a');
  link.download = `${owner}-frontend-dependencies.json`;
  link.href = window.URL.createObjectURL(blob_result);

  startBtn.disabled = false;
  downloadBtn.disabled = false;
  downloadBtn.addEventListener('click', () => {
    link.click();
  });

  state.innerText += `\n💾 Done. Now you can download your results`;
}

async function getRepositories() {
  let page = 1;
  let result = [];
  let response = await octokit.request(`GET /orgs/${owner}/repos?per_page=100`);
  result = [...response.data];

  while (response.headers.link && response.headers.link.search('next') !== -1) {
    response = await octokit.request(
      `GET /orgs/${owner}/repos?per_page=100&page=${++page}`
    );
    result = [...result, ...response.data];
  }

  return result;
}

async function getCommits(repo_name) {
  const response = await octokit.request(
    `GET /repos/${owner}/${repo_name}/commits`
  );

  return response.data;
}

async function getTree(repo_name, tree_sha) {
  const response = await octokit.request(
    `GET /repos/${owner}/${repo_name}/git/trees/${tree_sha}`
  );

  return response.data.tree;
}

async function getPackageJson(repo_name, packageFile_sha) {
  const response = await octokit.request(
    `GET /repos/${owner}/${repo_name}/git/blobs/${packageFile_sha}`
  );

  return response.data;
}
