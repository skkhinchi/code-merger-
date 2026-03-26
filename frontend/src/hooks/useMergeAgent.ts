import { useState } from 'react'
import axios from 'axios'
import { formatApiError } from '../utils/apiError'

type CommandResponse = {
  message: string
  source?: string
  target?: string
}

function handleAxiosError(e: unknown): string {
  return formatApiError(e)
}

function getBaseUrl(): string {
  const url = import.meta.env.VITE_API_URL
  return typeof url === 'string' ? url.replace(/\/$/, '') : ''
}

export function useMergeAgent() {
  const [input, setInput] = useState('')
  const [msg, setMsg] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mergeSuccess, setMergeSuccess] = useState(false)

  const sendCommand = async () => {
    const baseUrl = getBaseUrl()
    if (!baseUrl) {
      setMsg('Missing VITE_API_URL in environment')
      return
    }
    setLoading(true)
    setMergeSuccess(false)
    try {
      const res = await axios.post<CommandResponse>(`${baseUrl}/command`, {
        input,
      })
      setMsg(res.data.message)
      setShowModal(true)
    } catch (e) {
      setMsg(handleAxiosError(e))
    } finally {
      setLoading(false)
    }
  }

  const confirmMerge = async () => {
    const baseUrl = getBaseUrl()
    if (!baseUrl) {
      setMsg('Missing VITE_API_URL in environment')
      return
    }
    setLoading(true)
    try {
      const res = await axios.post<CommandResponse>(`${baseUrl}/confirm`)
      setMsg(res.data.message)
      setMergeSuccess(true)
      setShowModal(false)
    } catch (e) {
      setMergeSuccess(false)
      setMsg(handleAxiosError(e))
    } finally {
      setLoading(false)
    }
  }

  const cancelModal = () => {
    setShowModal(false)
  }

  return {
    input,
    setInput,
    msg,
    loading,
    showModal,
    mergeSuccess,
    sendCommand,
    confirmMerge,
    cancelModal,
  }
}
