import { Controller, Get, Param, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AppwriteStorageService } from '../services/appwrite-storage.service';

@ApiTags('Uploads')
@Controller('uploads')
export class UploadsController {
    constructor(private readonly storageService: AppwriteStorageService) { }

    @Post()
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Upload file to Appwrite Storage' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                },
            },
        },
    })
    @UseInterceptors(FileInterceptor('file'))
    async uploadFile(@UploadedFile() file: Express.Multer.File) {
        return this.storageService.uploadFile(file);
    }

    @Get(':fileId/:filename')
    @ApiOperation({ summary: 'Get file with a clean URL (Proxied)' })
    async getFile(@Param('fileId') fileId: string, @Res() res: any) {
        try {
            const { stream, contentType } = await this.storageService.getFileStream(fileId);
            res.setHeader('Content-Type', contentType);
            // Cache for 7 days to speed up WhatsApp previews and reduce storage load
            res.setHeader('Cache-Control', 'public, max-age=604800');
            stream.pipe(res);
        } catch (error) {
            res.status(404).send('File not found');
        }
    }
}
