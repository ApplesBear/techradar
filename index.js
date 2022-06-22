import { Octokit } from "https://cdn.skypack.dev/octokit";

const btn = document.querySelector('button');
btn.addEventListener('click', techRadar);

let owner, octokit;

async function techRadar() {
    const state = document.querySelector('.state');
    state.innerText = 'Please, wait. It will take some time...';

    setVariables();

    const repositories = await getFrontendRepositories();
    const packageJsonFiles = await getPackageJsonFiles(repositories);
    const dependencies = await getAllDependencies(packageJsonFiles);

    enableResultDownloading(dependencies);

    state.innerText = '';
}

function setVariables() {
    const token = document.querySelector('.token').value;
    owner = document.querySelector('.owner').value;
    octokit = new Octokit({
        auth: token
    });
}

async function getFrontendRepositories() {
    console.log('Getting repositories...');

    const repositories = await getRepositories();
    const repositoriesArray = repositories.data;
    const result = [];

    for (let i = 0; i < repositoriesArray.length; i++) {
        console.log('Filter frontend repositories...');

        const tags = await getTags(repositoriesArray[i].name);
        const tagsArray = tags.data;

        tagsArray.find((tag) => {
          if (tag.name === 'v28.1.1') {
            result.push(repositoriesArray[i]);
            return true;
          }
        });
    }

    return result;
}

async function getPackageJsonFiles(repositories) {
    console.log('Getting package.json files...');

    const packageJsons = [];

    for (let i = 0; i < repositories.length; i++) {
        const commits = await getCommits(repositories[i].name);
        const commitsArray = commits.data;

        const headCommit = commitsArray.shift();

        const tree = await getTree(repositories[i].name, headCommit.commit.tree.sha);
        const treeArray = tree.data.tree;

        parseNextTreeLvl(repositories[i], treeArray, packageJsons);
    }

    return packageJsons;
}

function parseNextTreeLvl(repo, tree = [], results) {
    tree.filter((element) => {
        if (element.path === 'package.json') {
            results.push({
              repo_name: repo.name,
              sha: element.sha});
        }

        return element.type === 'tree';
    });

    tree.forEach((nextTree) => {
        parseNextTreeLvl(nextTree, results);
    });
}

async function getAllDependencies(packageJsons) {
    const dependencies = {};

    for (let i = 0; i < packageJsons.length; i++) {
        const file = await getPackageJson(packageJsons[i].repo_name, packageJsons[i].sha);
        const json = JSON.parse(atob(file.data.content));

        getDependenciesFromJson(packageJsons[i].repo_name, json, dependencies);
    }

    return dependencies;
}


function getDependenciesFromJson(repo_name, json, dependencies) {
    console.log('Parse package.json files...');

    for (const dependency in json.dependencies) {
        if (!(dependency in dependencies)) {
            dependencies[dependency] = {
              uses: 0,
              versions: [],
              repos: []
            };
        }
        dependencies[dependency].uses++;
        dependencies[dependency].versions.push(json.dependencies[dependency]);
        dependencies[dependency].repos.push({
          name: repo_name,
          version: json.dependencies[dependency]
        });
    }

    for (const dependency in json.devDependencies) {
        if (!(dependency in dependencies)) {
            dependencies[dependency] = {
              uses: 0,
              versions: [],
              repos: []
            };
        }
        dependencies[dependency].uses++;
        dependencies[dependency].versions.push(json.devDependencies[dependency]);
        dependencies[dependency].versions = [...new Set(dependencies[dependency].versions)];
        dependencies[dependency].repos.push({
          name: repo_name,
          version: json.devDependencies[dependency]
        });
    }
}

function enableResultDownloading(result) {
    const string_result = JSON.stringify(result, undefined, 2);
    const blob_result = new Blob([string_result], {type: 'application/json'});

    const link = document.createElement('a');
    link.download = `${owner}-frontend-dependencies.json`;
    link.href = window.URL.createObjectURL(blob_result);

    const downloadBtn = document.querySelector('.download');
    downloadBtn.disabled = false;
    downloadBtn.addEventListener('click', () => {
        link.click();
    })

    console.log('Done. Now you can download your results.')
}

async function getRepositories() {
    return octokit.request(`GET /orgs/${owner}/repos`);
}

async function getTags(repo_name) {
    return octokit.request(`GET /repos/${owner}/${repo_name}/tags`);
}

async function getCommits(repo_name) {
    return octokit.request(`GET /repos/${owner}/${repo_name}/commits`);
}

async function getTree(repo_name, tree_sha) {
    return octokit.request(`GET /repos/${owner}/${repo_name}/git/trees/${tree_sha}`);
}

async function getPackageJson(repo_name, packageFile_sha) {
    return octokit.request(`GET /repos/${owner}/${repo_name}/git/blobs/${packageFile_sha}`);
}
