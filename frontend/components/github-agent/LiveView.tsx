"use client"

import React, { useEffect, useRef } from 'react'

interface LiveViewProps {
    frame: string | null
    status: string
}

export function LiveView({ frame, status }: LiveViewProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)

    useEffect(() => {
        if (frame && canvasRef.current) {
            const canvas = canvasRef.current
            const ctx = canvas.getContext('2d')
            const img = new Image()
            img.onload = () => {
                canvas.width = img.width
                canvas.height = img.height
                ctx?.drawImage(img, 0, 0)

                // Overlay status text
                if (ctx) {
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
                    ctx.fillRect(10, 10, ctx.measureText(status).width + 20, 30)
                    ctx.fillStyle = '#00ff00'
                    ctx.font = '16px monospace'
                    ctx.fillText(status, 20, 30)
                }
            }
            img.src = `data:image/jpeg;base64,${frame}`
        }
    }, [frame, status])

    return (
        <div className="relative w-full aspect-video bg-neutral-900 rounded-lg overflow-hidden border border-neutral-800 shadow-2xl">
            {frame ? (
                <canvas ref={canvasRef} className="w-full h-full object-contain" />
            ) : (
                <div className="flex items-center justify-center h-full text-neutral-500 font-mono italic">
                    {status || "Waiting for stream..."}
                </div>
            )}

            <div className="absolute bottom-4 left-4 flex space-x-2">
                <div className="flex items-center space-x-2 px-3 py-1 bg-black/60 backdrop-blur-md rounded-full border border-white/10">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-xs font-medium text-white/90">LIVE</span>
                </div>
            </div>
        </div>
    )
}
