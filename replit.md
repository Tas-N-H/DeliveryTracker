# Delivery Manager - Order Tracking System

## Overview

This is a full-stack web application for managing takeaway delivery orders. It provides a real-time dashboard with an interactive map for tracking delivery status and managing orders from various platforms like Uber Eats, Just Eat, and direct orders.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack Query (React Query) for server state
- **UI Components**: Radix UI primitives with shadcn/ui design system
- **Styling**: Tailwind CSS with CSS variables for theming
- **Build Tool**: Vite for development and production builds
- **Map Integration**: Leaflet.js for interactive mapping

### Backend Architecture
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js for REST API
- **Database ORM**: Drizzle ORM with PostgreSQL dialect
- **Database Provider**: Neon Database (serverless PostgreSQL)
- **Session Management**: PostgreSQL session store
- **Validation**: Zod schemas for type-safe data validation

### Development Environment
- **Platform**: Replit with Node.js 20, Web, and PostgreSQL 16 modules
- **Hot Reload**: Vite HMR for frontend, tsx for backend development
- **Process Management**: Parallel workflows for concurrent frontend/backend development

## Key Components

### Database Schema
- **Orders Table**: Stores order information including:
  - Order number, address, platform (uber-eats, just-eat, website, phone)
  - Status tracking (pending, in-transit, delivered)
  - Geographic coordinates (latitude, longitude)
  - Timestamps for order creation

### API Endpoints
- `GET /api/orders` - Retrieve all orders
- `POST /api/orders` - Create new order with validation
- `PATCH /api/orders/:id/status` - Update order status
- `DELETE /api/orders/:id` - Mark order as delivered (remove from active tracking)

### UI Components
- **Dashboard**: Main interface with sidebar and map view
- **Sidebar**: Order list with status indicators and management controls
- **Map Container**: Interactive map showing order locations with markers
- **Add Order Modal**: Form for creating new orders with address validation
- **Order Cards**: Individual order management with status update controls

### Storage Layer
- **Interface**: IStorage abstraction for data operations
- **Implementation**: Currently uses in-memory storage (MemStorage)
- **Database Ready**: Configured for PostgreSQL with Drizzle ORM

## Data Flow

1. **Order Creation**: User submits order through modal → validation → API creates order → updates in-memory store → refreshes UI
2. **Status Updates**: User clicks status buttons → API updates order → store updates → UI refreshes with new status
3. **Map Integration**: Orders with coordinates display as markers → clicking markers selects orders in sidebar
4. **Real-time Updates**: React Query manages cache invalidation and automatic refetching

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless**: Serverless PostgreSQL driver
- **drizzle-orm**: Type-safe ORM for database operations
- **@tanstack/react-query**: Server state management
- **@radix-ui/***: Accessible UI primitives
- **wouter**: Lightweight React router
- **react-hook-form**: Form state management
- **zod**: Runtime type validation

### Development Tools
- **vite**: Build tool and dev server
- **tsx**: TypeScript execution for development
- **esbuild**: Production bundling for server
- **drizzle-kit**: Database migrations and schema management

## Deployment Strategy

### Production Build
- **Frontend**: Vite builds React app to `dist/public`
- **Backend**: esbuild bundles Express server to `dist/index.js`
- **Database**: Drizzle migrations applied via `npm run db:push`

### Environment Configuration
- **Development**: `npm run dev` - starts both frontend and backend with hot reload
- **Production**: `npm run build && npm run start` - builds and serves production bundle
- **Database**: Requires `DATABASE_URL` environment variable for PostgreSQL connection

### Replit Deployment
- **Autoscale**: Configured for automatic scaling
- **Port**: Serves on port 5000 internally, exposed on port 80
- **Build Process**: Automated build on deployment with `npm run build`

## Changelog

- June 18, 2025. Initial setup

## User Preferences

Preferred communication style: Simple, everyday language.