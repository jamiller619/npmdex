import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import type { packageMetadata, packageScores, packages } from './schema.js'

export type Package = InferSelectModel<typeof packages>
export type NewPackage = InferInsertModel<typeof packages>

export type PackageMetadata = InferSelectModel<typeof packageMetadata>
export type NewPackageMetadata = InferInsertModel<typeof packageMetadata>

export type PackageScore = InferSelectModel<typeof packageScores>
export type NewPackageScore = InferInsertModel<typeof packageScores>

export type TypescriptSupport = 'native' | 'definitely-typed' | 'none'
