> This repo supported the initial alpha launch of WalletConnect v2 and is an __educational sample implementation of the WalletConnect v2 protocol__.  
>
> We __do not recommend__ its use and recommend to wait for the new open source version which we are actively working on. 
> 
> __Self-hosting is currently not supported__ and WalletConnect will not provide support for implementations relying on self-hosting until announced otherwise.

# WalletConnect Relay

This repository contains the minimal relay server for [WalletConnect v2.0](https://github.com/WalletConnect/walletconnect-monorepo).

## Quick Start

```
make dev
```

## Additional help

```
build                build docker images
clean                clean local environment
dev                  start local dev environment
help                 Show this help
logs                 show logs for docker containers. To get logs for a single container uses `make logs service=relay`
ps                   show docker container status
publish-dev          push docker images for dev environment to the docker hub
publish              push docker images to docker hub
pull                 pull image environment
stop                 stop local environment
test-client          runs "./packages/client" tests against the locally running relay
test-production      runs "./packages/client" tests against the relay.walletconnect.com
test-relay           runs "./test" tests against the locally running relay
test-staging         runs "./packages/client" tests against the staging.walletconnect.com
```


## License

Apache 2.0
