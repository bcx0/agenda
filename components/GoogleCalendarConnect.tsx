'use client'

import { useState, useEffect, useRef } from 'react'

interface Props {
  isConnected: boolean
  googleEmail?: string | null
  needsReauth?: boolean
}

export function GoogleCalendarConnect({ isConnected, googleEmail, needsReauth }: Props) {
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<'success' | 'error' | null>(null)
  const [progress, setProgress] = useState('')
  const abortRef = useRef(false)
  const autoSyncDone = useRef(false)

  useEffect(() => {
    if (syncResult) {
      const timer = setTimeout(() => setSyncResult(null), 8000)
      return () => clearTimeout(timer)
    }
  }, [syncResult])

  // Auto-sync on page load if connected and not needing reauth
  useEffect(() => {
    if (isConnected && !needsReauth && !autoSyncDone.current) {
      autoSyncDone.current = true
      handleSync()
    }
  }, [isConnected, needsReauth]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFullResync = async () => {
    if (!confirm('Cela va supprimer tous les RDV importés de Google et tout re-synchroniser. Continuer ?')) return
    setSyncing(true)
    setSyncResult(null)
    setProgress('Nettoyage des anciens imports...')

    try {
      const purgeRes = await fetch('/api/calendar/sync?step=purge', { method: 'POST' })
      if (!purgeRes.ok) throw new Error('Erreur lors du nettoyage')
      const purgeData = await purgeRes.json()
      setProgress(`Nettoyé: ${purgeData.deletedBookings} RDV, ${purgeData.deletedBlocks} blocks`)
      // Small delay then trigger normal sync
      await new Promise((r) => setTimeout(r, 500))
    } catch (err) {
      setSyncResult('error')
      setProgress(err instanceof Error ? err.message : 'Erreur')
      setSyncing(false)
      return
    }

    setSyncing(false)
    // Now trigger a normal full sync
    await handleSync()
  }

  const handleSync = async () => {
    setSyncing(true)
    setSyncResult(null)
    setProgress('Récupération...')
    abortRef.current = false

    let totalImported = 0
    let totalProcessed = 0

    try {
      // Step 1: Fetch all events page by page
      let allEvents: any[] = []
      let pageToken: string | null = null
      let isFirst = true

      do {
        if (abortRef.current) break

        const params = new URLSearchParams({ step: 'fetch' })
        if (pageToken) params.set('pageToken', pageToken)
        if (isFirst) params.set('reset', 'true')

        const res = await fetch(`/api/calendar/sync?${params.toString()}`, {
          method: 'POST',
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Erreur' }))
          throw new Error(err.error || `HTTP ${res.status}`)
        }

        const data = await res.json()
        allEvents = allEvents.concat(data.events ?? [])
        pageToken = data.nextPageToken ?? null
        isFirst = false

        setProgress(`Récupération... ${allEvents.length} événements`)

        // Small delay between pages to avoid Google rate limit
        if (pageToken) await new Promise((r) => setTimeout(r, 500))
      } while (pageToken)

      setProgress(`Traitement de ${allEvents.length} événements...`)

      // Step 2: Process events in batches of 100 (bulk pre-check skips existing)
      const BATCH_SIZE = 100
      for (let i = 0; i < allEvents.length; i += BATCH_SIZE) {
        if (abortRef.current) break

        const batch = allEvents.slice(i, i + BATCH_SIZE)

        const res = await fetch('/api/calendar/sync?step=process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events: batch }),
        })

        if (!res.ok) {
          console.error('[Sync] Process batch failed:', res.status)
          continue
        }

        const data = await res.json()
        totalImported += data.imported ?? 0
        totalProcessed += data.processed ?? 0

        setProgress(`Traitement... ${totalProcessed}/${allEvents.length}`)
      }

      setSyncResult('success')
      setProgress(`${totalProcessed} traités, ${totalImported} importés`)
    } catch (err) {
      console.error('[Sync] Error:', err)
      setSyncResult('error')
      setProgress(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSyncing(false)
    }
  }

  if (isConnected) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {needsReauth ? (
            <span className="inline-flex items-center gap-1.5 text-sm
              text-red-700 bg-red-50 border border-red-200
              rounded-full px-3 py-1">
              <svg className="w-3.5 h-3.5" fill="currentColor"
                viewBox="0 0 20 20">
                <path fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58
                  9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53
                  0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0
                  11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002
                  0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Reconnexion requise
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm
              text-green-700 bg-green-50 border border-green-200
              rounded-full px-3 py-1">
              <svg className="w-3.5 h-3.5" fill="currentColor"
                viewBox="0 0 20 20">
                <path fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414
                  0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1
                  0 011.414 0z" clipRule="evenodd" />
              </svg>
              Google Calendar connecté
            </span>
          )}
          {googleEmail && (
            <span className="text-xs text-gray-500">{googleEmail}</span>
          )}
        </div>

        {needsReauth && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <p className="font-semibold mb-0.5">Synchronisation interrompue</p>
            <p>
              Le token Google a expiré ou a été révoqué. La synchronisation
              automatique est en pause jusqu'à la reconnexion. Cliquez sur{' '}
              <strong>« Reconnecter »</strong> ci-dessous.
            </p>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="text-sm px-4 py-2 rounded-lg border border-gray-200
              bg-white hover:bg-gray-50 transition-colors disabled:opacity-50
              disabled:cursor-not-allowed font-medium text-gray-700"
          >
            {syncing ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"
                  fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10"
                    stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor"
                    d="M4 12a8 8 0 018-8v8z" />
                </svg>
                {progress || 'Synchronisation...'}
              </span>
            ) : (
              '\u21BB Synchroniser maintenant'
            )}
          </button>

          <button
            onClick={handleFullResync}
            disabled={syncing}
            className="text-xs px-3 py-2 rounded-lg border border-red-200
              text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50
              disabled:cursor-not-allowed"
          >
            Reset & re-sync
          </button>

          <a
            href="/api/auth/google"
            className="text-xs text-gray-400 hover:text-gray-600
              underline transition-colors"
          >
            Reconnecter
          </a>
        </div>

        {syncResult === 'success' && (
          <p className="text-xs text-green-600">
            ✓ {progress}
          </p>
        )}
        {syncResult === 'error' && (
          <p className="text-xs text-red-500">
            ✗ {progress || 'Erreur de synchronisation'}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <a
        href="/api/auth/google"
        className="inline-flex items-center gap-3 px-4 py-2.5
          bg-white border border-gray-200 rounded-lg shadow-sm
          hover:shadow-md hover:border-gray-300 transition-all
          w-fit font-medium text-gray-700 text-sm"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26
            1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92
            3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23
            1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99
            20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43
            8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45
            2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66
            2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Connecter Google Calendar
      </a>
      <p className="text-xs text-gray-400">
        Synchronisation bidirectionnelle avec votre agenda Google
      </p>
    </div>
  )
}
