import { ContractFactory, Contract, BigNumber, ContractInterface } from 'ethers';
import { Signer } from '@acala-network/bodhi';
import { toBN } from './utils-from-bodhi';

import uniFactoryContract from './UniswapV2Factory.json';
import uniRouterContract from './UniswapV2Router.json';
import IUniswapV2Pair from './IUniswapV2Pair.json';
import tokenContract from './Token.json';

// TODO: maybe export these 2 factory from bodhi?
/* --------------------------------------------------------
                 deployment extrinsic factory
----------------------------------------------------------- */
export const getDeployExtrinsic = async (signer: Signer, abi: ContractInterface, bytecode: string, args: any[] = [], value = 0) => {
  const evmAddress = await signer.getAddress();
  const factory = new ContractFactory(abi, bytecode, signer);

  const { data, to } = factory.getDeployTransaction(...args);

  const {
    gas: gasLimit,
    storage: storageLimit,
  } = await signer.provider.estimateResources({
    from: evmAddress,
    to,
    data,
  });

  return signer.provider.api.tx.evm.create(
    data,
    toBN(value),
    toBN(gasLimit),
    toBN(storageLimit.isNegative() ? 0 : storageLimit),
    []
  );
};

/* --------------------------------------------------------
                   call extrinsic factory
----------------------------------------------------------- */
export const getCallExtrinsic = async (signer: Signer, abi: ContractInterface, contractAddr: string, method: string, args: any[] = [], value = 0, force = false) => {
  const evmAddress = await signer.getAddress();
  const contract = new Contract(contractAddr, abi, signer);
  const data = contract.interface.encodeFunctionData(method, args);

  // default gasLimit and storageLimit
  let gasLimit = BigNumber.from(21000000);
  let storageLimit = BigNumber.from(64000);

  try {
    /* --------------------
       default gasLimit is big, so if we batch many tx
       might encounter `gasLimit exceeds block gas limit`
       so we try to get a better estimation of gas params
       this step could fail if the tx depends on the previous tx in the batch
       in which case we can force sending it using the default gas params
                                                         -------------------- */
    const { gas, storage } = await signer.provider.estimateResources({
      data,
      to: contractAddr,
      from: evmAddress,
      value,
    });

    gasLimit = gas;
    storageLimit = storage;
  } catch (err) {
    if (force) {
      console.log('---------- ❗ tx dry run failed ----------\n', err, '\n-------------------------------------------\n👌 but don\'t worry we will still force sending it', '\n⭐️ maybe some magic will happen ...');
    } else {
      throw err;
    }
  }

  return signer.provider.api.tx.evm.call(
    contractAddr,
    data,
    toBN(value),
    toBN(gasLimit),
    toBN(storageLimit.isNegative() ? 0 : storageLimit),
    []
  );
};

/* --------------------------------------------------------
                  extrinsic constructors
----------------------------------------------------------- */
export const getUniFactoryDeployExtrinsic = async (signer: Signer, deployer: string) => (
  getDeployExtrinsic(signer, uniFactoryContract.abi, uniFactoryContract.bytecode, [deployer])
);

const DUMMY_WETH_ADDR = '0xB7d729C983b819611E68DAee71b4A2C950f86dc8';
export const getUniRouterDeployExtrinsic = async (signer: Signer, uniCoreAddr:string) => (
  getDeployExtrinsic(signer, uniRouterContract.abi, uniRouterContract.bytecode, [uniCoreAddr, DUMMY_WETH_ADDR])
);

export const getTokenDeployExtrinsic = async (signer: Signer, args: any[]) => (
  getDeployExtrinsic(signer, tokenContract.abi, tokenContract.bytecode, args)
);

export const getTokenApproveExtrinsic = async (signer: Signer, contractAddr: string, args: any[]) => (
  getCallExtrinsic(signer, tokenContract.abi, contractAddr, 'approve', args)
);

export const getAddLiquidityExtrinsic = async (signer: Signer, contractAddr: string, args: any[], force = false) => (
  getCallExtrinsic(signer, uniRouterContract.abi, contractAddr, 'addLiquidity', args, 0, force)
);

/* --------------------------------------------------------
                      query helpers
----------------------------------------------------------- */
export const queryTokenBalance = async (signer: Signer, tokenAddr: string, addr: string): Promise<string> => {
  const contract = new Contract(tokenAddr, tokenContract.abi, signer);

  const res = await contract.callStatic.balanceOf(addr);
  return res.toString();
};

export const queryTokenAllowance = async (signer: Signer, tokenAddr: string, ownerAndSpender: [string, string]): Promise<string> => {
  const contract = new Contract(tokenAddr, tokenContract.abi, signer);

  const res = await contract.callStatic.allowance(...ownerAndSpender);
  return res.toHexString();
};

export const queryLiquidity = async (signer: Signer, uniCoreAddr: string, tokens: [string, string]) => {
  const uniCore = new Contract(uniCoreAddr, uniFactoryContract.abi, signer);
  const pairAddress = await uniCore.getPair(...tokens);
  const pair = new Contract(pairAddress, IUniswapV2Pair.abi, signer);

  const res = await pair.callStatic.balanceOf(await signer.getAddress());
  return res.toString();
};
