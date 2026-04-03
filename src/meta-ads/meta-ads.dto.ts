import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class ConnectPageDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    pageId!: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    pageName!: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    pageAccessToken!: string;
}

export class MetaWebhookDto {
    @ApiProperty()
    object!: string;

    @ApiProperty()
    entry!: any[];
}
