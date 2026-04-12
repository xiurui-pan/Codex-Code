import { formatFileSize } from '../../utils/format.js'
import type { Output } from './FileReadTool.js'

export const FILE_READ_STORED_TEXT_OMITTED =
  '[Stored read content omitted]'

export function compactFileReadOutputForStorage(output: Output): Output {
  switch (output.type) {
    case 'text':
      return {
        ...output,
        file: {
          ...output.file,
          content: FILE_READ_STORED_TEXT_OMITTED,
          storedContentOmitted: true,
        },
      }
    case 'image':
      return {
        ...output,
        file: {
          ...output.file,
          base64: '',
          storedBase64Omitted: true,
        },
      }
    case 'pdf':
      return {
        ...output,
        file: {
          ...output.file,
          base64: '',
          storedBase64Omitted: true,
        },
      }
    case 'notebook':
      return {
        ...output,
        file: {
          ...output.file,
          cells: [],
          cellCount: output.file.cells.length,
          storedCellsOmitted: true,
        },
      }
    case 'parts':
    case 'file_unchanged':
      return output
    default:
      return output
  }
}

export function summarizeFileReadOutput(output: Output): string {
  switch (output.type) {
    case 'text':
      return `Read ${output.file.numLines} ${output.file.numLines === 1 ? 'line' : 'lines'} from ${output.file.filePath}`
    case 'image':
      return `Read image (${formatFileSize(output.file.originalSize)})`
    case 'notebook': {
      const count =
        output.file.cells.length > 0
          ? output.file.cells.length
          : (output.file.cellCount ?? 0)
      return `Read ${count} ${count === 1 ? 'cell' : 'cells'} from ${output.file.filePath}`
    }
    case 'pdf':
      return `Read PDF ${output.file.filePath} (${formatFileSize(output.file.originalSize)})`
    case 'parts':
      return `Read ${output.file.count} ${output.file.count === 1 ? 'page' : 'pages'} from ${output.file.filePath}`
    case 'file_unchanged':
      return `File unchanged since last read: ${output.file.filePath}`
    default:
      return 'Read file'
  }
}

export function hasStoredFileReadContentOmitted(output: unknown): boolean {
  if (!output || typeof output !== 'object') {
    return false
  }
  const file = (output as { file?: unknown }).file
  if (!file || typeof file !== 'object') {
    return false
  }
  return Boolean(
    (file as { storedContentOmitted?: unknown }).storedContentOmitted,
  )
}
