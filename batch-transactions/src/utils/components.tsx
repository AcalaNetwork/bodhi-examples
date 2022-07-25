import React from 'react';
import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { Select } from 'antd';
import type {
  InjectedExtension,
  InjectedAccount,
} from '@polkadot/extension-inject/types';

const { Option } = Select;

export const Check = () => (<span className='check'>✓</span>);
export const DataGray: React.FC<{ value: string | number }> = ({ value }) => (<span className='grayLight'>{ value }</span>);
export const DataRed: React.FC<{ value: string | number }> = ({ value }) => (<span className='redLight'><ArrowDownOutlined />{ value }</span>);
export const DataGreen: React.FC<{ value: string | number }> = ({ value }) => (<span className='greenLight'><ArrowUpOutlined />{ value }</span>);

export const ExtensionSelect: React.FC<{
  extensionList: InjectedExtension[],
  curExtension: InjectedExtension | undefined,
  onChange: (targetName: string) => void,
  disabled: boolean,
}> = ({
  extensionList,
  curExtension,
  onChange,
  disabled,
}) => (
  <div>
    { !!extensionList.length && (
      <>
        <span style={{ marginRight: 10 }}>select a polkadot wallet:</span>
        <Select
          value={ curExtension?.name || 'no extension selected' }
          onChange={ onChange }
          disabled={ disabled }
        >
          { extensionList.map(ex => (
            <Option key={ ex.name } value={ ex.name }>
              { `${ex.name}/${ex.version}` }
            </Option>
          )) }
        </Select>
      </>
    ) }
  </div>
);

export const AccountSelect: React.FC<{
  accountList: InjectedAccount[],
  selectedAddress: string,
  onChange: (targetName: string) => void,
  disabled: boolean,
}> = ({
  accountList,
  selectedAddress,
  onChange,
  disabled,
}) => (
  <div>
    { !!accountList.length && (
      <>
        <span style={{ marginRight: 10 }}>account:</span>
        <Select
          value={ selectedAddress }
          onChange={ onChange }
          disabled={ disabled }
        >
          { accountList.map(account => (
            <Option key={ account.address } value={ account.address }>
              { account.name } / { account.address }
            </Option>
          )) }
        </Select>
      </>
    ) }
  </div>
);
