#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DMAP 메타데이터 가져오기 스크립트 (Python)
웹앱에서 생성한 메타데이터를 AutoCAD DXF 파일에 추가합니다.
"""

import json
import os
import sys
from pathlib import Path

try:
    import ezdxf
except ImportError:
    print("오류: ezdxf 라이브러리가 설치되지 않았습니다.")
    print("설치: pip install ezdxf")
    sys.exit(1)


def load_metadata(json_path):
    """메타데이터 JSON 파일 로드"""
    with open(json_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def insert_annotations(dxf_path, metadata, image_folder):
    """DXF 파일에 어노테이션 삽입"""
    
    # DXF 파일 열기
    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()
    
    # 어노테이션 레이어 생성
    if 'DMAP_ANNOTATIONS' not in doc.layers:
        doc.layers.add('DMAP_ANNOTATIONS', color=1)  # 빨간색
    
    annotations = metadata.get('annotations', [])
    
    print(f"\n{len(annotations)}개의 어노테이션을 처리합니다...")
    
    for anno in annotations:
        anno_type = anno.get('type')
        x = anno.get('x', 0)
        y = anno.get('y', 0)
        
        if anno_type == 'photo':
            # 사진 어노테이션
            image_name = anno.get('imageName')
            memo = anno.get('memo', '')
            image_path = os.path.join(image_folder, image_name)
            
            if os.path.exists(image_path):
                # 이미지 참조 삽입 (IMAGE 엔티티)
                try:
                    # 이미지 정의 추가
                    image_def = doc.add_image_def(
                        filename=image_path,
                        size_in_pixel=(800, 600)  # 기본 크기
                    )
                    
                    # 이미지 삽입
                    msp.add_image(
                        image_def=image_def,
                        insert=(x, y),
                        size_in_units=(50, 37.5),  # 비율 유지 (4:3)
                        dxfattribs={'layer': 'DMAP_ANNOTATIONS'}
                    )
                    
                    print(f"✓ 이미지 삽입: {image_name}")
                    
                    # 메모가 있으면 텍스트 추가
                    if memo:
                        msp.add_text(
                            memo,
                            dxfattribs={
                                'layer': 'DMAP_ANNOTATIONS',
                                'height': 2.5,
                                'color': 1  # 빨간색
                            }
                        ).set_placement((x, y - 10))
                        
                        print(f"  메모: {memo}")
                
                except Exception as e:
                    print(f"✗ 이미지 삽입 실패 ({image_name}): {e}")
            else:
                print(f"✗ 이미지 파일 없음: {image_path}")
                
                # 대신 텍스트로 표시
                msp.add_text(
                    f"[사진: {image_name}]",
                    dxfattribs={
                        'layer': 'DMAP_ANNOTATIONS',
                        'height': 3.0,
                        'color': 1
                    }
                ).set_placement((x, y))
        
        elif anno_type == 'text':
            # 텍스트 어노테이션
            text = anno.get('text', '')
            
            msp.add_text(
                text,
                dxfattribs={
                    'layer': 'DMAP_ANNOTATIONS',
                    'height': 3.0,
                    'color': 1  # 빨간색
                }
            ).set_placement((x, y))
            
            print(f"✓ 텍스트 삽입: {text}")
    
    # DXF 파일 저장
    output_path = dxf_path.replace('.dxf', '_annotated.dxf')
    doc.saveas(output_path)
    
    print(f"\n완료! 저장됨: {output_path}")
    return output_path


def main():
    """메인 함수"""
    print("=== DMAP 어노테이션 가져오기 ===\n")
    
    # 인자 확인
    if len(sys.argv) < 4:
        print("사용법: python dmap-import.py <DXF파일> <메타데이터JSON> <이미지폴더>")
        print("\n예시:")
        print("  python dmap-import.py drawing.dxf drawing_metadata.json ./images/")
        sys.exit(1)
    
    dxf_path = sys.argv[1]
    json_path = sys.argv[2]
    image_folder = sys.argv[3]
    
    # 파일 존재 확인
    if not os.path.exists(dxf_path):
        print(f"오류: DXF 파일을 찾을 수 없습니다: {dxf_path}")
        sys.exit(1)
    
    if not os.path.exists(json_path):
        print(f"오류: 메타데이터 파일을 찾을 수 없습니다: {json_path}")
        sys.exit(1)
    
    if not os.path.isdir(image_folder):
        print(f"오류: 이미지 폴더를 찾을 수 없습니다: {image_folder}")
        sys.exit(1)
    
    # 메타데이터 로드
    print(f"메타데이터 로드: {json_path}")
    metadata = load_metadata(json_path)
    
    print(f"DXF 파일: {metadata.get('dxfFile')}")
    print(f"마지막 수정: {metadata.get('lastModified')}")
    
    # 어노테이션 삽입
    output_path = insert_annotations(dxf_path, metadata, image_folder)
    
    print(f"\nAutoCAD에서 '{output_path}' 파일을 여세요.")


if __name__ == '__main__':
    main()

