;;; AutoCAD LISP Script - DMAP 어노테이션 가져오기
;;; DMAP 웹앱에서 생성한 메타데이터를 AutoCAD로 가져옵니다.

(defun c:DMAP-IMPORT ( / jsonfile imgfolder metadata annotations)
  (princ "\n=== DMAP 어노테이션 가져오기 ===")
  
  ;; 메타데이터 JSON 파일 선택
  (setq jsonfile (getfiled "메타데이터 JSON 파일 선택" "" "json" 0))
  (if (not jsonfile)
    (progn
      (princ "\n취소되었습니다.")
      (exit)
    )
  )
  
  ;; 이미지 폴더 선택
  (setq imgfolder (getfiled "이미지 폴더 선택" "" "" 1))
  (if (not imgfolder)
    (progn
      (princ "\n취소되었습니다.")
      (exit)
    )
  )
  
  ;; JSON 파일 읽기
  (setq metadata (dmap-read-json jsonfile))
  (if (not metadata)
    (progn
      (princ "\nJSON 파일을 읽을 수 없습니다.")
      (exit)
    )
  )
  
  ;; 어노테이션 목록 가져오기
  (setq annotations (cdr (assoc "annotations" metadata)))
  
  (if (not annotations)
    (progn
      (princ "\n어노테이션이 없습니다.")
      (exit)
    )
  )
  
  ;; 각 어노테이션 처리
  (princ (strcat "\n" (itoa (length annotations)) "개의 어노테이션을 처리합니다..."))
  
  (foreach anno annotations
    (dmap-insert-annotation anno imgfolder)
  )
  
  (princ "\n완료!")
  (princ)
)

;;; 어노테이션 삽입
(defun dmap-insert-annotation (anno imgfolder / type x y text imgname memo imgpath)
  (setq type (cdr (assoc "type" anno)))
  (setq x (cdr (assoc "x" anno)))
  (setq y (cdr (assoc "y" anno)))
  
  (cond
    ;; 사진 어노테이션
    ((= type "photo")
      (setq imgname (cdr (assoc "imageName" anno)))
      (setq memo (cdr (assoc "memo" anno)))
      (setq imgpath (strcat imgfolder "\\" imgname))
      
      ;; 이미지 삽입 시도
      (if (findfile imgpath)
        (progn
          (command "._-IMAGE" "_A" imgpath (list x y) 100 0)
          (princ (strcat "\n이미지 삽입: " imgname))
          
          ;; 메모가 있으면 텍스트로 추가
          (if (and memo (> (strlen memo) 0))
            (progn
              (command "._TEXT" (list x (- y 10)) 2.5 0 memo)
              (princ (strcat " (메모: " memo ")"))
            )
          )
        )
        (princ (strcat "\n경고: 이미지 파일을 찾을 수 없습니다: " imgpath))
      )
    )
    
    ;; 텍스트 어노테이션
    ((= type "text")
      (setq text (cdr (assoc "text" anno)))
      
      ;; 빨간색 텍스트 삽입
      (command "._TEXT" (list x y) 3.0 0 text)
      (command "._CHPROP" "_L" "" "_C" "1" "") ; 빨간색 (색상 코드 1)
      (princ (strcat "\n텍스트 삽입: " text))
    )
  )
)

;;; JSON 파일 읽기 (간단한 파서)
(defun dmap-read-json (filename / file content)
  ;; 주의: 이것은 매우 간단한 JSON 파서입니다.
  ;; 실제 프로젝트에서는 더 강력한 JSON 라이브러리를 사용하세요.
  
  (setq file (open filename "r"))
  (if file
    (progn
      (setq content (read-line file))
      (close file)
      
      ;; TODO: JSON 파싱 로직
      ;; 여기서는 AutoCAD의 JSON 지원이 제한적이므로
      ;; Python 스크립트를 사용하는 것을 권장합니다.
      
      (princ "\n경고: LISP에서는 JSON 파싱이 제한적입니다.")
      (princ "\nPython 스크립트(dmap-import.py)를 사용하세요.")
      nil
    )
    nil
  )
)

(princ "\nDMAP 가져오기 명령이 로드되었습니다.")
(princ "\n사용법: DMAP-IMPORT")
(princ "\n주의: Python 스크립트(dmap-import.py)를 사용하는 것을 권장합니다.")
(princ)

