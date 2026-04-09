import React, { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
    const [account, setAccount] = useState(() => {
        const saved = localStorage.getItem('aws_account')
        return saved ? JSON.parse(saved) : null
    })

    // Session start timestamp — every sign-in resets this, so only
    // alerts detected AFTER this timestamp are shown in the current session.
    const [sessionStart, setSessionStart] = useState(() => {
        const s = sessionStorage.getItem('cloudshield_session_start')
        return s ? parseInt(s, 10) : null
    })

    // accountData shape for ROOT account:
    // { id, aws_account_id, profile_name, region, account_type: "root" }
    //
    // accountData shape for IAM USER:
    // { id, account_id, parent_aws_account_id, username, region, account_type: "iam" }

    const connect = (accountData) => {
        const now = Date.now()
        localStorage.setItem('aws_account', JSON.stringify(accountData))
        sessionStorage.setItem('cloudshield_session_start', String(now))
        setAccount(accountData)
        setSessionStart(now)
    }

    const disconnect = () => {
        localStorage.removeItem('aws_account')
        sessionStorage.removeItem('cloudshield_session_start')
        setAccount(null)
        setSessionStart(null)
    }

    // Helper — display name for whoever is connected
    const displayName = account
        ? account.account_type === 'iam'
            ? account.username
            : (account.profile_name || account.aws_account_id)
        : null

    // Helper — the actual AWS account ID being scanned
    const awsAccountId = account
        ? account.account_type === 'iam'
            ? account.parent_aws_account_id
            : account.aws_account_id
        : null

    return (
        <AuthContext.Provider value={{ account, connect, disconnect, displayName, awsAccountId, sessionStart }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)
