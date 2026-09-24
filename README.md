Setup Minikube GitHub Action
===============================

[<img src="https://github.com/manusa/actions-setup-minikube/workflows/Perform checks/badge.svg"/>](https://github.com/manusa/actions-setup-minikube/actions)
[![Run action (E2E tests)](https://github.com/manusa/actions-setup-minikube/actions/workflows/runner.yml/badge.svg)](https://github.com/manusa/actions-setup-minikube/actions/workflows/runner.yml)

Set up your GitHub Actions workflow with a specific version of
[Minikube](https://github.com/kubernetes/minikube)
and [Kubernetes](https://github.com/kubernetes/kubernetes).

_Currently only Linux Ubuntu 18.04 or later
[CI environment](https://help.github.com/en/github/automating-your-workflow-with-github-actions/virtual-environments-for-github-actions)
is supported, on either x64 (amd64) or arm64 (e.g. `ubuntu-24.04-arm`) runners.
The action is validated on every change against the `ubuntu-22.04`,
`ubuntu-24.04`, and `ubuntu-26.04` runner images (and their `-arm` variants)._

_On self-hosted Ubuntu 25.10 or later runners using the default `none` driver,
keep the classic `sudo` package installed next to `sudo-rs` (it provides
`/usr/bin/sudo.ws`). With `sudo-rs` alone, only `HOME` and `MINIKUBE_HOME` are
passed to `minikube start`, so variables such as `KUBECONFIG`,
`MINIKUBE_CONTAINER_RUNTIME` or proxy settings are not._

## Usage

### Basic

```yaml
name: Example workflow

on: [push]

jobs:
  example:
    name: Example Minikube-Kubernetes Cluster interaction
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v7
      - name: Setup Minikube
        uses: manusa/actions-setup-minikube@v2.19.0
        with:
          minikube version: 'v1.39.0'
          kubernetes version: 'v1.37.1'
          github token: ${{ secrets.GITHUB_TOKEN }}
      - name: Interact with the cluster
        run: kubectl get nodes
```

### Required input parameters

| Parameter            | Description                                                                       |
|----------------------|-----------------------------------------------------------------------------------|
| `minikube version`   | Minikube [version](https://github.com/kubernetes/minikube/releases) to deploy     |
| `kubernetes version` | Kubernetes [version](https://github.com/kubernetes/kubernetes/releases) to deploy |

### Optional input parameters

| Parameter           | Description                                                                                                                              |
|---------------------|------------------------------------------------------------------------------------------------------------------------------------------|
| `github token`      | GITHUB_TOKEN secret value to access GitHub REST API with an unlimited number of requests (optional but recommended)                      |
| `driver`            | Minikube [driver](https://minikube.sigs.k8s.io/docs/drivers/) to use. This action supports `none` (default if not specified) or `docker` |
| `container runtime` | The container runtime to be used (valid options: docker, cri-o, containerd; default: docker unless `MINIKUBE_CONTAINER_RUNTIME` is set)  |
| `start args`        | Additional arguments to append to [`minikube start`](https://minikube.sigs.k8s.io/docs/commands/start/) command (see [below](#start-args)) |

### `start args`

The `start args` value is appended to the `minikube start` command and
evaluated by `/bin/sh` (dash on Ubuntu), so POSIX shell syntax applies.
Multiple arguments, quotes and environment variables all work, while
bash-only syntax such as brace expansion does not:

```yaml
      - name: Setup Minikube
        uses: manusa/actions-setup-minikube@v2.19.0
        env:
          MAX_PODS: 50
        with:
          minikube version: 'v1.39.0'
          kubernetes version: 'v1.37.1'
          start args: '--addons=ingress --extra-config=kubelet.max-pods="$MAX_PODS"'
```

The `driver` and `container runtime` inputs are evaluated by the same shell.
Never place untrusted data (such as pull request titles or branch names) in
these inputs through a `${{ }}` expression. Pass it through an environment
variable instead and reference that variable in double quotes, as in the
example above: an unquoted `$VAR` is split into words, so an untrusted value
could add extra `minikube start` flags. See GitHub's
[secure use reference](https://docs.github.com/en/actions/reference/security/secure-use#use-an-intermediate-environment-variable)
for details.

## License

The scripts and documentation in this project are released under the [Apache 2.0](./LICENSE) license.
