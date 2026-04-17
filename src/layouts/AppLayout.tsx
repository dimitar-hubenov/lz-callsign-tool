// src/layouts/AppLayout.tsx
import { Outlet, Link } from 'react-router-dom';

function AppLayout() {
    return (
        <div className="min-h-screen bg-linear-to-br from-gray-900 via-gray-800 to-gray-900 py-8 px-4">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-white mb-2">LZ Callsign Tool</h1>
                    <p className="text-gray-400">Проверка за свободни опознавателни знаци</p>
                </div>

                {/* Page content */}
                <div >
                    <Outlet />
                </div>
            </div>
        </div>
    );
}

export default AppLayout
