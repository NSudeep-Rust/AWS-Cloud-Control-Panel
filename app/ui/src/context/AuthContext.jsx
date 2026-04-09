import React, { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
    const [account, setAccount] = useState(() => {
        const saved = localStorage.getItem('aws_account')
        return saved ? JSON.parse(saved) : null
    })

    const [sessionStart, setSessionStart] = useState(() => {
        const s = sessionStorage.getItem('cloudshield_session_start')
        return s ? parseInt(s, 10) : null
    })


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

    const displayName = account
        ? account.account_type === 'iam'
            ? account.username
            : (account.profile_name || account.aws_account_id)
        : null

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
