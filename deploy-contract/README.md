# Bodhi.js Example - Contract Interaction
This is a basic example that demonstrates how to sign EVM+ transactions with a polkadot wallet and [bodhi.js](https://github.com/AcalaNetwork/bodhi.js/).

app: https://bodhi-example-contract.vercel.app/

## Run
- start a dev server: `yarn dev`
- build: `yarn build`
- lint: `yarn lint`

## Core Flow
There are 4 steps 

**step 1**: we first need to connect a bodhi signer provider to chain node
```tsx
import { Provider, Signer } from '@acala-network/bodhi';

const nodeUrl = 'wss://acala-mandala.api.onfinality.io/public-ws';
const signerProvider = new Provider({
  provider: new WsProvider(nodeUrl),
});

await signerProvider.isReady();
```

**step 2**: then we need to connect polkadot wallet extension
```tsx
const allExtensions = await web3Enable('bodhijs-example');
const curExtension = allExtensions[0];

curExtension?.accounts.get().then(result => {
  // save accounts somewhere
});

// create a signer from signerProvider and extension signer
const signer = new Signer(signerProvider, accountAddress, curExtension.signer)

// get some info about this account
const [evmAddress, accountBalance] = await Promise.all([
  signer.queryEvmAddress(),
  signer.getBalance(),
]);
```

**step 3**: deploy [echo contract](https://github.com/AcalaNetwork/hardhat-tutorials/blob/master/echo/README.md) using the signer we just created
```tsx
import { ContractFactory } from 'ethers';

const factory = new ContractFactory(echoContract.abi, echoContract.bytecode, signer);

const contract = await factory.deploy();
const echo = await contract.echo();         // check the initial echo msg
```

**step 4**: call the contract we just deployed
```tsx
import { Contract } from 'ethers';

const instance = new Contract(deployedAddress, echoContract.abi, signer);

await instance.scream(newMsg);
const newEcho = await instance.echo();      // check the new echo msg
```