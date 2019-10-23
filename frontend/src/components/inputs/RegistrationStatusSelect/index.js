import React from 'react';

import { RegistrationStatuses } from '@hackjunction/shared';
import StatusBadge from 'components/generic/StatusBadge';
import { Select } from 'antd';

const RegistrationStatusSelect = ({
    value,
    onChange,
    placeholder = 'Select status',
    selectProps,
    allowRestricted = false
}) => {
    const restrictedOptions = RegistrationStatuses.asArray
        .filter(status => !status.allowAssign)
        .map(status => {
            return (
                <Select.Option key={status.id} value={status.id} disabled={!allowRestricted}>
                    <StatusBadge status={status.id} />
                </Select.Option>
            );
        });
    return (
        <Select
            placeholder={placeholder}
            size="large"
            value={value}
            style={{ width: '100%', position: 'relative' }}
            onChange={onChange}
            {...selectProps}
        >
            <Select.OptGroup label="Can assign">
                {RegistrationStatuses.asArray
                    .filter(status => status.allowAssign)
                    .map(status => {
                        return (
                            <Select.Option key={status.id} value={status.id}>
                                <StatusBadge status={status.id} />
                            </Select.Option>
                        );
                    })}
                {allowRestricted ? restrictedOptions : null}
            </Select.OptGroup>
            {!allowRestricted ? (
                <Select.OptGroup label="Can't assign directly">{restrictedOptions}</Select.OptGroup>
            ) : null}
        </Select>
    );
};

export default RegistrationStatusSelect;